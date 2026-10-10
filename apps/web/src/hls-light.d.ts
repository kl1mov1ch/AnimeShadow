// hls.js ships its light build without declarations of its own; it is the
// same class with fewer optional features compiled in, so it takes the full
// build's types.
declare module "hls.js/light" {
  import Hls from "hls.js";
  export default Hls;
}
