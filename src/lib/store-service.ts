// Original Content Above This Line

// Helper function to build fuzzy pattern
function buildFuzzyLikePattern(keyword: string) {
    const normalized = normalizeQueryText(keyword);
    if (normalized.length < 3) return null;
    return `%${normalized.split("").join("%")}%`;
}

// Updated findRegisteredStoresByKeyword
const like = `%${keyword}%`;
const fuzzyLike = buildFuzzyLikePattern(keyword);
const patterns = fuzzyLike ? [like, fuzzyLike] : [like];

// Iterate over patterns and run the query
const rows = [];
for (const pattern of patterns) {
    // your logic to run full/noKakao/minimal ilike query
    // collect rows into array
}

return rows; // Ensure dedup/filtering logic remains unchanged

// Original Content Below This Line