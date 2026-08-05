export type DailyBrowseScope = 'new' | 'all';

export interface DailyBrowseSummary {
  date: string;
  timeZone: string;
  newCardCount: number;
  allCardCount: number;
}

export interface DailyBrowseCard {
  cardId: string;
  noteId: string;
  deckId: string;
  templateOrdinal: number;
  noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
  fieldsJson: string;
  firstSeenAtUtc: string;
  wasNewToday: boolean;
}

export interface DailyBrowseResponse {
  date: string;
  timeZone: string;
  scope: DailyBrowseScope;
  totalCards: number;
  cards: DailyBrowseCard[];
}
