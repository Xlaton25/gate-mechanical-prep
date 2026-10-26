import {
  BarChart3, BookOpen, Database, Home, LineChart, ListChecks, Menu, RotateCcw, Search, Settings, Target, Timer,
  type LucideIcon,
} from "lucide-react";

export type NavPath =
  | "/" | "/practice" | "/learn" | "/revision" | "/pyq" | "/trends" | "/mocks" | "/analytics" | "/settings" | "/admin" | "/more";

export interface NavItem { to: NavPath; label: string; icon: LucideIcon }

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Study", items: [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/practice", label: "Daily Practice", icon: Target },
    { to: "/learn", label: "Learning Hub", icon: BookOpen },
    { to: "/revision", label: "Revision", icon: RotateCcw },
  ]},
  { label: "Explore", items: [
    { to: "/pyq", label: "PYQ Explorer", icon: Search },
    { to: "/trends", label: "Trends", icon: LineChart },
  ]},
  { label: "Assess", items: [
    { to: "/mocks", label: "Mock Tests", icon: Timer },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
  ]},
  { label: "Manage", items: [
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/admin", label: "Data Administration", icon: Database },
  ]},
];

export const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/practice", label: "Practice", icon: ListChecks },
  { to: "/revision", label: "Revise", icon: RotateCcw },
  { to: "/mocks", label: "Tests", icon: Timer },
  { to: "/more", label: "More", icon: Menu },
];
