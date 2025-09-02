import localforage from "localforage";

localforage.config({ name: "kai-keeper" });

export const save = (key, value) => localforage.setItem(key, value);
export const load = async (key, fallback) => {
  const v = await localforage.getItem(key);
  return v ?? fallback;
};
