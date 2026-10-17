"use client";

import { useEffect } from "react";
import { STUDIO_STYLES } from "@/lib/studio/styles";

const STYLE_ID = "studio-styles";

export function useStudioStyles() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = STUDIO_STYLES;
    document.head.appendChild(el);
  }, []);
}
