export type ParsedOrderEntities = {
  intentDetected: boolean;
  productId: string | null;
  productName: string | null;
  productPrice: number | null;
  hasVariants: boolean;
  variantId: string | null;
  variantName: string | null;
  quantity: number | null;
}

// Normalize text for matching
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  // Stopwords that don't uniquely identify products
  const stopwords = [
    'yang', 'warna', 'ukuran', 'size', 'untuk', 'dan', 'sama', 'pakai', 
    'minta', 'mau', 'beli', 'pesan', 'order', 'tolong', 'buah', 'pcs', 
    'biji', 'pasang', 'banyak', 'sebanyak', 'jumlah', 'saya', 'aku', 
    'ingin', 'boleh', 'ada'
  ];
  return text.split(' ').filter(w => w.length > 0 && !stopwords.includes(w));
}

export function detectIntent(message: string): boolean {
  const msg = normalizeText(message);
  return /(pesan|beli|order|mau|minta)/.test(msg);
}

export function extractQuantity(message: string): number | null {
  // Strip out "size XX" so it doesn't get confused as quantity
  const msg = message.toLowerCase().replace(/size\s*\d+/g, '');
  
  // match "10", "10pcs", "10 buah", "10 biji"
  // Require word boundary and prefer explicit units if present
  const match = msg.match(/\b(\d+)\s*(pcs|buah|biji|pasang|lusin)?\b/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Map textual numbers to integers (1-10)
  const wordNumbers: Record<string, number> = {
    'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5, 
    'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9, 'sepuluh': 10
  };
  
  for (const [word, num] of Object.entries(wordNumbers)) {
    if (new RegExp(`\\b${word}\\b`).test(msg)) {
      return num;
    }
  }

  return null;
}

export function matchProductAndVariant(
  message: string, 
  products: any[]
): { product: any, variant: any | null } | null {
  const tokens = tokenize(normalizeText(message));
  if (tokens.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const product of products) {
    const prodTokens = tokenize(normalizeText(product.name));
    let baseScore = 0;
    
    for (const t of tokens) {
      if (prodTokens.includes(t)) {
        baseScore += 2; // Exact match is better
      } else if (t.length > 3 && prodTokens.some(pt => pt.includes(t) || t.includes(pt))) {
        baseScore += 1; // Partial match only if length > 3
      }
    }
    
    if (product.variants && product.variants.length > 0) {
      let bestLocalVariant = null;
      let bestLocalVariantScore = 0;
      
      for (const variant of product.variants) {
        const varTokens = tokenize(normalizeText(variant.name));
        let variantScore = 0;
        for (const t of tokens) {
          if (varTokens.includes(t)) {
            variantScore += 2;
          } else if (t.length > 3 && varTokens.some(vt => vt.includes(t) || t.includes(vt))) {
            variantScore += 1;
          } else if (t.length <= 3 && varTokens.includes(t)) {
             variantScore += 1;
          }
        }
        
        if (variantScore > bestLocalVariantScore) {
          bestLocalVariantScore = variantScore;
          bestLocalVariant = variant;
        }
      }
      
      const totalScore = baseScore + bestLocalVariantScore;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        // Only set variant if we actually matched words from the variant name
        bestMatch = { product, variant: bestLocalVariantScore > 0 ? bestLocalVariant : null };
      }
    } else {
      if (baseScore > bestScore) {
        bestScore = baseScore;
        bestMatch = { product, variant: null };
      }
    }
  }

  return bestMatch;
}

export function parseOrderMessage(message: string, products: any[]): ParsedOrderEntities {
  const intentDetected = detectIntent(message);
  const quantity = extractQuantity(message);
  const match = matchProductAndVariant(message, products);

  if (!match) {
    return {
      intentDetected,
      productId: null,
      productName: null,
      productPrice: null,
      hasVariants: false,
      variantId: null,
      variantName: null,
      quantity
    };
  }

  return {
    intentDetected,
    productId: match.product.id,
    productName: match.product.name,
    productPrice: match.product.price,
    hasVariants: match.product.variants.length > 0,
    variantId: match.variant ? match.variant.id : null,
    variantName: match.variant ? match.variant.name : null,
    quantity
  };
}
