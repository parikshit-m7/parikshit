const test = require("node:test");
const assert = require("node:assert/strict");
const { buildListingFilter } = require("../utils/listingFilters");

test("searches listing title, description, location, and country case-insensitively", () => {
  const { mongoFilter, formValues } = buildListingFilter({
    search: "  Goa  ",
  });

  assert.deepEqual(
    mongoFilter.$or.map((condition) => Object.keys(condition)[0]),
    ["title", "description", "location", "country"]
  );
  assert.ok(mongoFilter.$or.every((condition) => {
    const pattern = Object.values(condition)[0];
    return pattern instanceof RegExp && pattern.source === "Goa" && pattern.flags === "i";
  }));
  assert.equal(formValues.search, "Goa");
});

test("escapes regex characters so user input is treated as plain text", () => {
  const { mongoFilter } = buildListingFilter({ search: "Goa.*" });

  assert.equal(mongoFilter.$or[0].title.source, "Goa\\.\\*");
  assert.equal(mongoFilter.$or[0].title.test("Goa.*"), true);
  assert.equal(mongoFilter.$or[0].title.test("Goa-anything"), false);
});

test("combines search with inclusive minimum and maximum prices", () => {
  const { mongoFilter, formValues } = buildListingFilter({
    search: "beach",
    minPrice: "1200",
    maxPrice: "4500.50",
  });

  assert.deepEqual(mongoFilter.price, { $gte: 1200, $lte: 4500.5 });
  assert.equal(mongoFilter.$or.length, 4);
  assert.deepEqual(formValues, {
    search: "beach",
    minPrice: 1200,
    maxPrice: 4500.5,
  });
});

test("ignores invalid or negative prices and caps long search input", () => {
  const longSearch = "a".repeat(120);
  const { mongoFilter, formValues } = buildListingFilter({
    search: longSearch,
    minPrice: "-1",
    maxPrice: "not-a-price",
  });

  assert.equal(mongoFilter.price, undefined);
  assert.equal(formValues.search.length, 100);
  assert.equal(formValues.minPrice, "");
  assert.equal(formValues.maxPrice, "");
});

test("returns an empty database filter when no search or price is provided", () => {
  const { mongoFilter, formValues } = buildListingFilter({});

  assert.deepEqual(mongoFilter, {});
  assert.deepEqual(formValues, { search: "", minPrice: "", maxPrice: "" });
});
