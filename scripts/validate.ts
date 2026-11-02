import { catalog } from "../src/domain/model";
if (
  catalog.categories.length !== 6 ||
  catalog.questions.filter((q) => q.active).length !== 12 ||
  catalog.categories.some(
    (c) =>
      catalog.questions.filter((q) => q.active && q.categoryId === c.id)
        .length !== 2,
  )
)
  throw Error("初期seed件数不一致");
console.log(`カタログ検証成功: ${catalog.contentVersion}, 6カテゴリー / 12問`);
