import { create } from "zustand";
import { persist } from "zustand/middleware";

export const FEATURED_FONTS = [
	"Montserrat",
	"Poppins",
	"Inter",
	"Roboto",
	"Anton",
	"Bebas Neue",
	"Oswald",
	"Playfair Display",
	"Lora",
	"Cormorant Garamond",
	"Caveat",
	"Dancing Script",
	"Pacifico",
	"Space Mono",
	"Barlow Condensed",
	"Nunito",
	"Raleway",
	"Merriweather",
];

export const useFontPickerStore = create<{
	favorites: string[];
	toggleFavorite: (family: string) => void;
}>()(
	persist(
		(set) => ({
			favorites: [],
			toggleFavorite: (family) =>
				set((s) => ({
					favorites: s.favorites.includes(family)
						? s.favorites.filter((f) => f !== family)
						: [...s.favorites, family],
				})),
		}),
		{ name: "maestro.font-favorites" },
	),
);
