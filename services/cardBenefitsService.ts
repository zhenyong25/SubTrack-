import { CardBenefit, CardPointTransaction } from '../types';

const normalizeCardName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const cardNameAliases: Record<string, string[]> = {
  'uobprvimiles': ['uobprivimiles', 'uobprimiles', 'uobprvimiles'],
  'citibankpremiermiles': ['citibankpremiermiles', 'citipremiermiles', 'premiermiles'],
};

const formatTransferLabel = (transferRatio: number) => {
  if (!Number.isFinite(transferRatio) || transferRatio <= 0) return 'n/a';
  if (transferRatio === 1) return '1:1';
  if (transferRatio < 1) {
    const miles = 1 / transferRatio;
    return `1:${Number.isInteger(miles) ? miles.toFixed(0) : miles.toFixed(1)}`;
  }

  return `${Number.isInteger(transferRatio) ? transferRatio.toFixed(0) : transferRatio.toFixed(1)}:1`;
};

const DEFAULT_CARD_BENEFITS: CardBenefit[] = [
  {
    id: 'uob-prvi-shopping',
    cardName: 'UOB PRVI Miles',
    issuer: 'UOB',
    category: 'Shopping',
    title: 'Retail spend',
    description: 'Track shopping-friendly reward categories that typically help you accumulate miles faster.',
    earnRateMpd: 1.4,
    krisflyerTransferRatio: 0.5,
    sortOrder: 1,
    isHighlighted: true,
  },
  {
    id: 'uob-prvi-travel',
    cardName: 'UOB PRVI Miles',
    issuer: 'UOB',
    category: 'Travel',
    title: 'Hotel and travel',
    description: 'Useful for bookings and travel spend that you want to funnel into miles conversion.',
    earnRateMpd: 2.4,
    krisflyerTransferRatio: 0.5,
    sortOrder: 2,
    isHighlighted: true,
  },
  {
    id: 'uob-prvi-dining',
    cardName: 'UOB PRVI Miles',
    issuer: 'UOB',
    category: 'Dining',
    title: 'Daily dining',
    description: 'Good to track if you want a simple miles earning profile for everyday meals.',
    earnRateMpd: 1.4,
    krisflyerTransferRatio: 0.5,
    sortOrder: 3,
  },
  {
    id: 'citi-premier-shopping',
    cardName: 'Citibank PremierMiles',
    issuer: 'Citibank',
    category: 'Shopping',
    title: 'Retail spend',
    description: 'A straightforward category to help you see where miles are coming from most often.',
    earnRateMpd: 1.2,
    krisflyerTransferRatio: 1,
    sortOrder: 1,
    isHighlighted: true,
  },
  {
    id: 'citi-premier-hotel',
    cardName: 'Citibank PremierMiles',
    issuer: 'Citibank',
    category: 'Hotel',
    title: 'Hotel bookings',
    description: 'Handy for travel-heavy spending where you want to optimize miles accumulation.',
    earnRateMpd: 2.2,
    krisflyerTransferRatio: 1,
    sortOrder: 2,
    isHighlighted: true,
  },
  {
    id: 'citi-premier-travel',
    cardName: 'Citibank PremierMiles',
    issuer: 'Citibank',
    category: 'Travel',
    title: 'Travel spend',
    description: 'Track flights and travel-related purchases under a dedicated miles-focused card.',
    earnRateMpd: 1.2,
    krisflyerTransferRatio: 1,
    sortOrder: 3,
  },
];

export const getFallbackCardBenefits = (cardName: string) =>
  DEFAULT_CARD_BENEFITS
    .filter(benefit => {
      const benefitKey = normalizeCardName(benefit.cardName);
      const inputKey = normalizeCardName(cardName);
      const aliases = cardNameAliases[benefitKey] ?? [benefitKey];
      return aliases.includes(inputKey);
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

export const getCardBenefitsForCard = (cardName: string, dbBenefits: CardBenefit[] = []) => {
  const matches = dbBenefits
    .filter(benefit => {
      const benefitKey = normalizeCardName(benefit.cardName);
      const inputKey = normalizeCardName(cardName);
      const aliases = cardNameAliases[benefitKey] ?? [benefitKey];
      return aliases.includes(inputKey);
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (matches.length > 0) return matches;
  return getFallbackCardBenefits(cardName);
};

export const getCardMilesSummary = (cardName: string, dbBenefits: CardBenefit[] = []) => {
  const benefits = getCardBenefitsForCard(cardName, dbBenefits);
  const maxEarnRate = benefits.reduce((max, benefit) => Math.max(max, benefit.earnRateMpd ?? 0), 0);
  const transferRatio = benefits.find(benefit => typeof benefit.krisflyerTransferRatio === 'number')?.krisflyerTransferRatio ?? 1;
  const transferLabel = formatTransferLabel(transferRatio);

  return {
    benefits,
    maxEarnRate,
    transferRatio,
    transferLabel,
    exchangeRate: transferRatio > 0 ? 1 / transferRatio : 0,
  };
};

export const getCardPointsSummary = (
  cardId: string,
  cardName: string,
  cardPointTransactions: CardPointTransaction[] = [],
  dbBenefits: CardBenefit[] = []
) => {
  const milesSummary = getCardMilesSummary(cardName, dbBenefits);
  const currentPoints = cardPointTransactions
    .filter(transaction => transaction.cardId === cardId)
    .reduce((sum, transaction) => sum + Number(transaction.pointsDelta || 0), 0);

  return {
    ...milesSummary,
    currentPoints,
    krisflyerMiles: currentPoints * milesSummary.exchangeRate,
  };
};
