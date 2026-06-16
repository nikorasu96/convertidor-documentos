"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "./icons";

/**
 * Botón claro/oscuro. El tema inicial lo fija el script anti-flash del layout;
 * aquí solo sincronizamos el estado y persistimos la elección del usuario.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* almacenamiento no disponible: el cambio sigue aplicando en esta sesión */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
      title={dark ? "Modo claro" : "Modo oscuro"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/70 text-neutral-600 transition-all duration-300 hover:border-neutral-300 hover:text-neutral-900 active:scale-95 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-neutral-100"
    >
      {/* Antes de montar mostramos un placeholder neutro para evitar desajuste de hidratación */}
      <span className="text-[1.05rem] transition-opacity duration-300" style={{ opacity: mounted ? 1 : 0 }}>
        {dark ? <Sun /> : <Moon />}
      </span>
    </button>
  );
}
