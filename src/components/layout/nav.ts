import {
  Bell, BedDouble, Bus, CalendarDays, ClipboardCheck, FileClock, Hotel, Home, LayoutDashboard, Megaphone, MessagesSquare,
  Radio, Receipt, ListChecks, Scale, Settings, Ticket, User, UserCheck, Users, BarChart3, Contact,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'chat' | 'notifications' | 'approvals' | 'review';
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const memberNav: NavGroup[] = [
  {
    label: 'Trip',
    items: [
      { to: '/', label: 'Dashboard', icon: Home },
      { to: '/live', label: 'Trip Live', icon: Radio },
      { to: '/itinerary', label: 'Itinerary', icon: CalendarDays },
      { to: '/tickets', label: 'Train Tickets', icon: Ticket },
      { to: '/accommodation', label: 'Accommodation', icon: Hotel },
      { to: '/rooms', label: 'Room Allocation', icon: BedDouble },
      { to: '/transport', label: 'Transport', icon: Bus },
      { to: '/vendors', label: 'Hotels & Travel', icon: Contact },
      { to: '/checklist', label: 'Checklist & Roll call', icon: ListChecks },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/expenses', label: 'Expenses', icon: Receipt },
      { to: '/settlements', label: 'Settlement', icon: Scale },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/chat', label: 'Group Chat', icon: MessagesSquare, badge: 'chat' },
      { to: '/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/members', label: 'Trip Members', icon: Users },
      { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
      { to: '/profile', label: 'Profile', icon: User },
    ],
  },
];

export const adminNav: NavGroup[] = [
  {
    label: 'Admin',
    items: [
      { to: '/', label: 'Admin Dashboard', icon: LayoutDashboard },
      { to: '/admin/settings', label: 'Trip Settings', icon: Settings },
      { to: '/members', label: 'Member Management', icon: Users },
      { to: '/admin/approvals', label: 'Member Approvals', icon: UserCheck, badge: 'approvals' },
      { to: '/live', label: 'Trip Live', icon: Radio },
    ],
  },
  {
    label: 'Plan',
    items: [
      { to: '/itinerary', label: 'Itinerary Management', icon: CalendarDays },
      { to: '/tickets', label: 'Ticket Management', icon: Ticket },
      { to: '/accommodation', label: 'Accommodation', icon: Hotel },
      { to: '/rooms', label: 'Room Allocation', icon: BedDouble },
      { to: '/transport', label: 'Transport Management', icon: Bus },
      { to: '/vendors', label: 'Hotels & Travel', icon: Contact },
      { to: '/checklist', label: 'Checklist & Roll call', icon: ListChecks },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/expenses', label: 'Expense Management', icon: Receipt },
      { to: '/expenses?tab=review', label: 'Expense Verification', icon: ClipboardCheck, badge: 'review' },
      { to: '/settlements', label: 'Settlement Management', icon: Scale },
      { to: '/admin/reports', label: 'Trip Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Communicate',
    items: [
      { to: '/announcements', label: 'Group Announcements', icon: Megaphone },
      { to: '/chat', label: 'Group Chat', icon: MessagesSquare, badge: 'chat' },
      { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
      { to: '/admin/audit', label: 'Audit History', icon: FileClock },
      { to: '/profile', label: 'Profile', icon: User },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/chat', label: 'Chat', icon: MessagesSquare, badge: 'chat' },
];
