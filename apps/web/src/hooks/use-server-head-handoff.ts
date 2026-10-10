import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { releaseServerHead } from "@/lib/seo";

/** The server-rendered head belongs to the page the visit began on; from
 *  the first in-app navigation the pages set their own (see lib/seo). */
export function useServerHeadHandoff(): void {
  const { pathname, search } = useLocation();
  const first = useRef(`${pathname}${search}`);
  useEffect(() => {
    if (`${pathname}${search}` !== first.current) releaseServerHead();
  }, [pathname, search]);
}
