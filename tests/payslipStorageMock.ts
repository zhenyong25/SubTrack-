const files = new Map<string, File>();
export const state = { failDelete: false };
export const getSupabaseClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  storage: { from: () => ({
    upload: async (path: string, file: File) => { files.set(path, file); return { error: null }; },
    list: async (prefix: string, options: { offset: number; limit: number }) => ({ data: [...files.entries()].filter(([path]) => path.startsWith(prefix + '/')).slice(options.offset, options.offset + options.limit).map(([path, file]) => ({ id: path, name: path.slice(prefix.length + 1), metadata: { size: file.size } })), error: null }),
    download: async (path: string) => ({ data: files.get(path), error: null }),
    remove: async (paths: string[]) => { if (state.failDelete) return { error: { message: 'Storage unavailable' } }; paths.forEach(path => files.delete(path)); return { error: null }; },
  }) },
});
