import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Ticket,
  BookOpen,
  Workflow,
  FlaskConical,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/evaluations", label: "Evaluations", icon: FlaskConical },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
