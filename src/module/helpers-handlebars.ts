/**
 * @file A place to store Handlebars helpers for our templates
 */
import OSE, { type InventoryItemTag } from "./config";

const registerHelpers = async () => {
  // Handlebars template helpers
  Handlebars.registerHelper("eq", (a, b) => a === b);

  Handlebars.registerHelper("mod", (val) => {
    if (val > 0) {
      return `+${val}`;
    }
    if (val < 0) {
      return `${val}`;
    }
    return "0";
  });

  Handlebars.registerHelper("add", (lh, rh) => Number.parseInt(lh, 10) + Number.parseInt(rh, 10));

  Handlebars.registerHelper("subtract", (lh, rh) => Number.parseInt(lh, 10) - Number.parseInt(rh, 10));

  Handlebars.registerHelper("divide", (lh, rh) => Math.floor(Number.parseFloat(lh) / Number.parseFloat(rh)));

  Handlebars.registerHelper("mult", (lh, rh) => Math.round(100 * Number.parseFloat(lh) * Number.parseFloat(rh)) / 100);

  Handlebars.registerHelper("roundWeight", (weight) => Math.round(Number.parseFloat(weight) / 100) / 10);

  Handlebars.registerHelper("getTagIcon", (tagValue: string) => {
    const tagKey = (Object.keys(CONFIG.OSE.tags) as InventoryItemTag[])
      // find key for the tag display name who's name matches the provided tag text.
      .find((findTagName) => CONFIG.OSE.tags[findTagName] === tagValue);
    // if that tag key is found, return the image for the tag key
    return tagKey ? CONFIG.OSE.tag_images[tagKey] : null;
  });

  // A gauge with no maximum reads as wholly empty rather than dividing by zero.
  // Stamina starts at 0/0 until a class die sets it, and 0/0 produced NaN (an
  // invalid height, so the gauge vanished) while n/0 produced Infinity (clamped
  // to a full bar). Both looked like the widget was broken.
  Handlebars.registerHelper("counter", (status, value, max) => {
    const filled = max > 0 ? (100 * value) / max : 0;
    return Math.clamp(status ? filled : 100 - filled, 0, 100);
  });

  Handlebars.registerHelper("times", (n, block) => {
    let accum = "";
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < n; ++i) accum += block.fn(i);
    return accum;
  });

  Handlebars.registerHelper("path", (relativePath) => `${OSE.systemPath()}${relativePath}`);

  Handlebars.registerHelper("asset", (relativePath) => `${OSE.assetsPath}${relativePath}`);

  Handlebars.registerHelper("ceil", (val) => Math.ceil(val));

  Handlebars.registerHelper("partial", (path) => `${OSE.systemPath()}/templates/${path}`);
};

export default registerHelpers;
