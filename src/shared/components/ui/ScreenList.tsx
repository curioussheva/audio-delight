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
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { FlashList, type FlashListProps } from "@shopify/flash-list";
import { chooseListKind } from "@/shared/utils/listPattern";

/** Pegangan minimal daftar untuk scroll programatik (mis. tombol geser
    strip DETAIL BAND Equalizer). FlatList maupun FlashList punya
    scrollToOffset, jadi satu bentuk ini cukup untuk keduanya. */
export interface ScrollableListHandle {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
}

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
  /** Teruskan metrik scroll ke pemanggil — mis. indikator geser kustom
      (strip DETAIL BAND Equalizer). Opsional; pemanggil lain tidak berubah. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  scrollEventThrottle?: number;
  /** Ref opsional ke daftar — untuk scroll programatik (tombol geser).
      Pemanggil lain tidak berubah bila tidak diisi. */
  listRef?: React.RefObject<ScrollableListHandle | null>;
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
  onScroll,
  onContentSizeChange,
  onLayout,
  scrollEventThrottle,
  listRef,
}: ScreenListProps<T>) {
  const kind = chooseListKind({ horizontal, nestedInScrollView, boundedSmall });

  // Teruskan ref lewat callback supaya satu bentuk pegangan
  // (ScrollableListHandle) cukup untuk FlatList maupun FlashList.
  const attachListRef = (instance: ScrollableListHandle | null) => {
    if (listRef) {
      listRef.current = instance;
    }
  };

  if (kind === "flash-list") {
    return (
      <FlashList
        ref={attachListRef}
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
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        onLayout={onLayout}
        scrollEventThrottle={scrollEventThrottle}
      />
    );
  }

  return (
    <FlatList
      ref={attachListRef}
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
      onScroll={onScroll}
      onContentSizeChange={onContentSizeChange}
      onLayout={onLayout}
      scrollEventThrottle={scrollEventThrottle}
    />
  );
}
