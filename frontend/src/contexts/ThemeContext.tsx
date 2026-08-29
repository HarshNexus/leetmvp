import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = { dark: boolean; toggle: () => void };
const Context = createContext<Theme>({ dark: false, toggle: () => undefined });
export function ThemeProvider({ children }: { children: ReactNode }) { const [dark, setDark] = useState(() => localStorage.getItem('leet_theme') === 'dark'); useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('leet_theme', dark ? 'dark' : 'light'); }, [dark]); return <Context.Provider value={{ dark, toggle: () => setDark(value => !value) }}>{children}</Context.Provider>; }
export const useTheme = () => useContext(Context);
