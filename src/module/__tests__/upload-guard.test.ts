/**
 * @file Tests for the player upload folder: where it is, what counts as being
 *       in it, and renaming uploads so they never overwrite each other.
 */
import type { QuenchMethods } from "../../e2e";
import { isInUploadDir, isUploadDir, resolveUploadDir, uniqueFileName } from "../upload-guard";

export const key = "vogelfrei.uploadGuard";
export const options = { displayName: "Vogelfrei: Player Upload Folder" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Resolving the upload folder", () => {
    it("Defaults to a players folder inside the world", () => {
      expect(resolveUploadDir("", "in-profundum")).equal("worlds/in-profundum/players");
      expect(resolveUploadDir("   ", "w")).equal("worlds/w/players");
    });

    it("Trims slashes and normalises backslashes", () => {
      expect(resolveUploadDir("/players/", "w")).equal("players");
      expect(resolveUploadDir("art\\players", "w")).equal("art/players");
    });
  });

  describe("Recognising the upload folder", () => {
    it("Matches the folder itself, encoded or not", () => {
      expect(isUploadDir("worlds/w/players", "worlds/w/players")).equal(true);
      expect(isUploadDir("worlds/w/players/", "worlds/w/players")).equal(true);
      expect(isUploadDir("my%20art", "my art")).equal(true);
    });

    it("Does not match a parent, sibling or subfolder", () => {
      expect(isUploadDir("worlds/w", "worlds/w/players")).equal(false);
      expect(isUploadDir("players", "worlds/w/players")).equal(false);
      expect(isUploadDir("worlds/w/players/old", "worlds/w/players")).equal(false);
    });

    it("Knows which files sit in it", () => {
      expect(isInUploadDir("worlds/w/players/a%20b.png", "worlds/w/players")).equal(true);
      expect(isInUploadDir("players/a.png", "worlds/w/players")).equal(false);
      expect(isInUploadDir("a.png", "worlds/w/players")).equal(false);
    });
  });

  describe("Never overwriting another upload", () => {
    it("Keeps a free name", () => {
      expect(uniqueFileName("token.png", ["portrait.png"])).equal("token.png");
    });

    it("Numbers a taken name, ignoring case", () => {
      expect(uniqueFileName("token.png", ["Token.PNG"])).equal("token-2.png");
      expect(uniqueFileName("token.png", ["token.png", "token-2.png"])).equal("token-3.png");
    });

    it("Copes with no extension and dotted names", () => {
      expect(uniqueFileName("notes", ["notes"])).equal("notes-2");
      expect(uniqueFileName("a.b.png", ["a.b.png"])).equal("a.b-2.png");
    });
  });
};
