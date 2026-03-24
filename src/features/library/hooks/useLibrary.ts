import { useState, useEffect, useCallback } from "react";
import { LibraryScanner } from "../api/scanner";
import { useLibraryStore } from "../store/libraryStore";
import { Song } from "@/shared/types/audio";

export const useLibrary = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const setTracks = useLibraryStore((s) => s.setTracks);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await LibraryScanner.getLibrarySongs();
      setSongs(data as Song[]);
      // Sinkronisasi ke store untuk tab lain (Album/Artist)
      if (data && data.length > 0) {
        setTracks(data as any);
      }
    } catch (error) {
      console.error("Gagal meload lagu dari database:", error);
    } finally {
      setLoading(false);
    }
  }, [setTracks]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { songs, loading, reload };
};
 