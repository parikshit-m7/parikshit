const MAX_SEARCH_LENGTH = 100;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildListingSearch(value) {
  const search =
    typeof value === "string" ? value.trim().slice(0, MAX_SEARCH_LENGTH) : "";
  const mongoFilter = {};

  if (search) {
    const searchPattern = new RegExp(escapeRegExp(search), "i");
    mongoFilter.$or = ["title", "description", "location", "country"].map(
      (field) => ({ [field]: searchPattern })
    );
  }

  return { mongoFilter, search };
}

module.exports = { buildListingSearch };
