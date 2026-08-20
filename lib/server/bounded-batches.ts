export async function runBoundedBatches<Input, Output>(
  items: Input[],
  batchSize: number,
  worker: (item: Input) => Promise<Output>,
  shouldStop: (result: Output) => boolean,
) {
  const results: Output[] = [];
  const safeBatchSize = Math.max(1, Math.min(5, Math.floor(batchSize)));
  for (let index = 0; index < items.length; index += safeBatchSize) {
    const batch = items.slice(index, index + safeBatchSize);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
    if (batchResults.some(shouldStop)) break;
  }
  return results;
}
