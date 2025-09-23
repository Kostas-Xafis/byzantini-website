/**
 * This function maps a value with from [valMin, valMax] to [outMin, outMax]
 */
export function mappedValue(value: number, valMin = 0, valMax = 1, outMin = 0, outMax = 1): number {
    if (valMin === valMax) return outMin;
    if (outMin === outMax) return outMin;
    if (value >= valMax) return outMax;
    if (value <= valMin) return outMin;
    let range = valMax - valMin;
    let outRange = outMax - outMin;

    // Apply a floor and ceiling to the value
    if (value > valMax) {
        value = valMax;
    } else if (value < valMin) {
        value = valMin;
    }
    // First normalization in respect to the input range
    let normalized = (value - valMin) / range;
    // Second normalization in respect to the output range
    return normalized * outRange + outMin;
};

export function getKeyIndex<T extends {}>(key: keyof T, obj: T) {
    let keys = Object.keys(obj);
    return keys.indexOf(key as string);
}

export const deepCopy = <T>(obj: T): T => {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(deepCopy) as any;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, deepCopy(v)])) as any;
};
