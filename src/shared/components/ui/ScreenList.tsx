// src/shared/components/ui/ScreenList.tsx
//
// U-P2-53: SATU pola daftar.
//
// Pemanggil mendeklarasikan BENTUK daftarnya (`horizontal` /
// `nestedInScrollView` / `boundedSmall`); implementasi (FlashList vs
// FlatList) dipilih `chooseListKind` — alasan pemilihannya tercatat di
// `src/shared/utils/listPattern.ts`, bukan ditebak per screen.
//
// - FlashList: daftar vertikal panjang (lagu Library, hasil Search, isi
//   playlist). FlashList v2 mengukur item otomatis (tidak ada
//   `estimatedItemSize`).
// - FlatList: pengecualian tercatat — mixer band Equalizer (horizontal +
//   bersarang di ScrollView) dan daftar playlist (kecil/terbatas + section
//   header). Keduanya lewat jalur ini tanpa mengubah perilaku scrollnya.
import React, { type ReactElement } from "react";
import {
  FlatList,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { FlashList, type FlashListProps } from "@shopify/flash-list";
import { chooseListKind } from "@/shared/utils/listPattern";

export interface ScreenListProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  horizontal?: boolean;
  /** Daftar bersarang di dalam ScrollView vertikal (jalur FlatList). */
  nestedInScrollView?: boolean;
  /** Jumlah item memang kecil/terbatas (jalur FlatList). */
  boundedSmall?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListEmptyComponent?: ReactElement | null;
  ListHeaderComponent?: ReactElement | null;
  extraData?: unknown;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  directionalLockEnabled?: boolean;
}

export function ScreenList<T>({
  data,
  renderItem,
  keyExtractor,
  horizontal,
  nestedInScrollView,
  boundedSmall,
  contentContainerStyle,
  ListEmptyComponent,
  ListHeaderComponent,
  extraData,
  showsVerticalScrollIndicator,
  showsHorizontalScrollIndicator,
  directionalLockEnabled,
}: ScreenListProps<T>) {
  const kind = chooseListKind({ horizontal, nestedInScrollView, boundedSmall });

  if (kind === "flash-list") {
    return (
      <FlashList
        data={data}
        // Cast beralasan: tipe renderItem FlashList tidak punya
        // `separators` (punya RN ListRenderItem), tapi tidak satu pun
        // renderItem pemanggil yang memakai `separators` — semuanya hanya
        // membaca `item`/`index`. FlashList sendiri tidak pernah
        // menyediakan `separators`, jadi cast ini tidak menyembunyikan
        // perilaku yang hilang.
        renderItem={
          renderItem as unknown as FlashListProps<T>["renderItem"]
        }
        keyExtractor={keyExtractor}
        contentContainerStyle={contentContainerStyle}
        ListEmptyComponent={ListEmptyComponent}
        ListHeaderComponent={ListHeaderComponent}
        extraData={extraData}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      />
    );
  }

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal={horizontal}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={ListEmptyComponent}
      ListHeaderComponent={ListHeaderComponent}
      extraData={extraData}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      directionalLockEnabled={directionalLockEnabled}
    />
  );
}
