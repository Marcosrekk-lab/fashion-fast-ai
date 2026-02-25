export interface ImageItem {
  id: string;
  originalUri: string;
  originalBase64: string | null;
  enhancedUri: string | null;
  enhancedBase64: string | null;
  enhancing: boolean;
  enhanceFailed: boolean;
}

export interface ListingDraft {
  id: string;
  imageUri: string;
  imageUris?: string[];
  brand: string;
  category: string;
  title: string;
  material: string;
  condition: string;
  conditionScore: string;
  flaws: string;
  description: string;
  sellProbability: number;
  quickSellPrice: number;
  maxProfitPrice: number;
  suggestedPrice: number;
  createdAt: number;
}
