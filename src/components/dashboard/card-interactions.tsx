"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/**
 * The small set of actions a card is allowed to take.
 *
 * Cards never fetch or choose what to say. A timer asks the dashboard to open
 * another card or to send one fixed prompt, so the model can continue a guided
 * flow without the renderer executing model-authored code.
 */
export type CardInteractions = {
  /** The one open card, by id, or null when every card is collapsed. */
  openCardId: string | null;
  showCard: (id: string) => void;
  send: (text: string) => void;
  /** True while a turn is already in flight. */
  busy: boolean;
};

const CardInteractionsContext = createContext<CardInteractions>({
  openCardId: null,
  showCard: () => {},
  send: () => {},
  busy: false,
});

export function CardInteractionsProvider({
  value,
  children,
}: {
  value: CardInteractions;
  children: ReactNode;
}) {
  return (
    <CardInteractionsContext.Provider value={value}>
      {children}
    </CardInteractionsContext.Provider>
  );
}

export function useCardInteractions(): CardInteractions {
  return useContext(CardInteractionsContext);
}
