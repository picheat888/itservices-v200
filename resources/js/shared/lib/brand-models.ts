// The models a model select offers: the chosen brand's own, none before a brand is chosen (pure, node tests).

/** Models of `brandId`; with no brand, only the saved model (so its name still shows). */
export function modelsForBrand<T extends { id: number; brand_id?: number | null }>(
    models: readonly T[],
    brandId: number | null,
    chosenId: number | null,
): T[] {
    if (brandId === null) {
        return chosenId === null ? [] : models.filter((m) => m.id === chosenId);
    }
    return models.filter((m) => m.brand_id === brandId);
}
