import {
  Archive,
  Banknote,
  Bus,
  Car,
  Clapperboard,
  CreditCard,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  type LucideIcon,
  Music,
  PawPrint,
  Plane,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Tag,
  Users,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react';

const CATEGORY_ICON_RULES: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ['grocer'], icon: ShoppingBasket },
  { keywords: ['food', 'dining', 'restaurant', 'cafe', 'coffee'], icon: Utensils },
  { keywords: ['rent', 'accommodat', 'accomodat', 'housing', 'mortgage'], icon: Home },
  { keywords: ['bill', 'utilit', 'fee', 'electric', 'water'], icon: Zap },
  { keywords: ['transport', 'bus', 'train', 'commute'], icon: Bus },
  { keywords: ['car', 'fuel', 'gas', 'parking'], icon: Car },
  { keywords: ['travel', 'flight', 'trip', 'vacation'], icon: Plane },
  { keywords: ['shop'], icon: ShoppingBag },
  { keywords: ['gym', 'fitness', 'workout'], icon: Dumbbell },
  { keywords: ['health', 'medical', 'doctor', 'pharmacy'], icon: HeartPulse },
  { keywords: ['insurance'], icon: ShieldCheck },
  { keywords: ['educat', 'school', 'course', 'tuition'], icon: GraduationCap },
  { keywords: ['subscript', 'software', 'app', 'saas'], icon: Laptop },
  { keywords: ['entertainment', 'movie', 'cinema', 'game', 'streaming'], icon: Clapperboard },
  { keywords: ['music'], icon: Music },
  { keywords: ['social', 'friend', 'party'], icon: Users },
  { keywords: ['pet'], icon: PawPrint },
  { keywords: ['gift', 'donat'], icon: Gift },
  { keywords: ['allowance', 'pocket money'], icon: Wallet },
  { keywords: ['collection', 'saving', 'fund'], icon: Archive },
  { keywords: ['debt', 'loan', 'repay'], icon: Banknote },
  { keywords: ['card', 'credit'], icon: CreditCard },
  { keywords: ['productiv', 'work', 'office'], icon: RefreshCw },
];

const DEFAULT_CATEGORY_ICON: LucideIcon = Tag;

export const getCategoryIcon = (category: string): LucideIcon => {
  const normalized = category.trim().toLowerCase();
  const match = CATEGORY_ICON_RULES.find(rule => rule.keywords.some(keyword => normalized.includes(keyword)));
  return match ? match.icon : DEFAULT_CATEGORY_ICON;
};
