import { useEffect, useRef, useState, type RefObject } from "react";

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = (position + 1.0) * 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;
// GPU scaling only: no sharpness or colour enhancement is applied.
const fragmentSource = `
precision mediump float;
uniform sampler2D frame;
varying vec2 uv;
void main() {
  gl_FragColor = texture2D(frame, uv);
}
`;

export function VideoUpscaler({
  videoRef,
  source,
  filter,
  height,
  onUnavailable,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  source: string;
  filter?: string | undefined;
  height: 1080 | 1440;
  onUnavailable?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setVisible(false);
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
    });
    if (!gl || !("requestVideoFrameCallback" in video)) {
      unavailableRef.current?.();
      return;
    }
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let callback = 0;
    let stopped = false;
    let shown = false;
    let slowFrames = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      setVisible(false);
      unavailableRef.current?.();
    };
    const compile = (kind: number, code: string) => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("Shader unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error("Shader compilation failed");
      return shader;
    };
    const schedule = () => {
      if (!stopped) callback = video.requestVideoFrameCallback(draw);
    };
    const draw = () => {
      if (stopped) return;
      if (
        document.hidden ||
        video.videoHeight >= height ||
        video.videoHeight <= 0 ||
        video.readyState < 2
      ) {
        if (shown) {
          shown = false;
          setVisible(false);
        }
        schedule();
        return;
      }
      try {
        const start = performance.now();
        const aspect = video.videoWidth / video.videoHeight;
        const width = Math.round((height * aspect) / 2) * 2;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          setRatio(aspect);
          gl.viewport(0, 0, width, height);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (gl.getError() !== gl.NO_ERROR) {
          stop();
          return;
        }
        if (!shown) {
          shown = true;
          setVisible(true);
        }
        slowFrames =
          performance.now() - start > 20 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames >= 8) {
          stop();
          return;
        }
      } catch {
        stop();
        return;
      }
      schedule();
    };
    try {
      program = gl.createProgram();
      if (!program) throw new Error("Program unavailable");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Shader link failed");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // A paused frame also responds immediately to changing output resolution.
      draw();
    } catch {
      stop();
    }
    canvas.addEventListener("webglcontextlost", stop);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback(callback);
      canvas.removeEventListener("webglcontextlost", stop);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    };
  }, [videoRef, source, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2"
      style={{
        display: visible ? "block" : "none",
        aspectRatio: ratio,
        width: "100%",
        height: "auto",
        objectFit: "contain",
        filter,
      }}
    />
  );
}
