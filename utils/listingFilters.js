const MAX_SEARCH_LENGTH = 100;

function normalizeSearch(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

function parsePrice(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildListingFilter(query = {}) {
  const search = normalizeSearch(query.search);
  const minPrice = parsePrice(query.minPrice);
  const maxPrice = parsePrice(query.maxPrice);
  const mongoFilter = {};

  if (search) {
    const searchPattern = new RegExp(escapeRegExp(search), "i");
    mongoFilter.$or = ["title", "description", "location", "country"].map(
      (field) => ({ [field]: searchPattern })
    );
  }

  if (minPrice !== null || maxPrice !== null) {
    mongoFilter.price = {};

    if (minPrice !== null) {
      mongoFilter.price.$gte = minPrice;
    }

    if (maxPrice !== null) {
      mongoFilter.price.$lte = maxPrice;
    }
  }

  return {
    mongoFilter,
    formValues: {
      search,
      minPrice: minPrice ?? "",
      maxPrice: maxPrice ?? "",
    },
  };
}

module.exports = { buildListingFilter };
