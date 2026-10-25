// Wallet names -> addresses: ENS names (vitalik.eth) and Basenames (name.base.eth). Basenames live
// on Base and resolve through ENS's off-chain lookup, so a public resolver API does the work
// (ensdata.net, falling back to web3.bio). Both are free, keyless and allow browser calls.

export const isWalletName = (input: string) => /^([a-z0-9-]+\.)+eth$/i.test(input.trim()) && !/^0x/i.test(input.trim());

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const fetchJson = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  return response.json().catch(() => null);
};

export const resolveWalletName = async (name: string, signal?: AbortSignal): Promise<string | null> => {
  const clean = encodeURIComponent(name.trim().toLowerCase());
  const ensdata = await fetchJson(`https://api.ensdata.net/${clean}`, signal).catch(() => null);
  if (EVM_ADDRESS.test(ensdata?.address || '')) return ensdata.address;
  const web3bio = await fetchJson(`https://api.web3.bio/ns/${clean}`, signal).catch(() => null);
  const match = Array.isArray(web3bio) ? web3bio.find((entry: { address?: string }) => EVM_ADDRESS.test(entry.address || '')) : null;
  return match ? match.address : null;
};
