"use client";

import { useEffect, useState } from "react";
import { registerAllPlugins } from "@/app/_plugins";

/**
 * Mount-only component that runs plugin registration on the client. It
 * intentionally renders nothing — it exists purely for the side-effect of
 * populating the widget + nav registries.
 *
 * A small state bump after registration forces one extra render tree flush
 * so subtrees that read the registries during their first render (e.g. the
 * sidebar reading `getPluginNavItems()`) see the registered entries.
 */
export function PluginsBootstrap() {
  const [, setReady] = useState(false);
  useEffect(() => {
    registerAllPlugins();
    setReady(true);
  }, []);
  return null;
}
