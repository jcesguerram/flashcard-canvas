// Pure callout logic, with no Obsidian imports, so it can be tested with plain Node.
//
// A card is a canvas text box whose first line opens a foldable callout:
//   > [!pregunta]+ What is present value?
//   > The value today of money you receive later.
// The "+" (open) or "-" (folded) after the type is what makes it foldable, and
// what the plugin flips when you click the card's title.

export type Fold = '+' | '-';

/** The first line of a foldable callout: "> [!type]+" with optional spaces. */
const HEAD_RE = /^([ \t]*>[ \t]*\[!)([^\]\s]+)(\])([+-])/;

export interface CardHead {
	type: string;
	fold: Fold;
}

function firstLine(text: string): string {
	const nl = text.indexOf('\n');
	return nl < 0 ? text : text.slice(0, nl);
}

/** The callout type and fold state of a card, or null if the text isn't a card. */
export function readCard(text: string | undefined | null): CardHead | null {
	if (!text) return null;
	const m = firstLine(text).match(HEAD_RE);
	if (!m) return null;
	return { type: m[2] ?? '', fold: (m[4] as Fold) ?? '+' };
}

export function isCard(text: string | undefined | null): boolean {
	return readCard(text) !== null;
}

export function isOpen(text: string): boolean {
	return readCard(text)?.fold !== '-';
}

/** The same text with the card's fold marker set. Text that isn't a card comes back unchanged. */
export function setFold(text: string, fold: Fold): string {
	return text.replace(HEAD_RE, (_m, a: string, type: string, b: string) => a + type + b + fold);
}

export function toggleFold(text: string): string {
	const head = readCard(text);
	if (!head) return text;
	return setFold(text, head.fold === '+' ? '-' : '+');
}

export interface TemplateOptions {
	type: string;
	question: string;
	answer: string;
	open: boolean;
}

/** Callout types can't contain spaces or brackets. */
export function cleanType(type: string): string {
	return type.trim().replace(/[\s[\]]+/g, '-') || 'question';
}

/** The text a new card starts with. */
export function template(o: TemplateOptions): string {
	const fold: Fold = o.open ? '+' : '-';
	const q = o.question.replace(/\r?\n/g, ' ');
	const a = o.answer.split(/\r?\n/).map((l) => '> ' + l).join('\n');
	return `> [!${cleanType(o.type)}]${fold} ${q}\n${a}`;
}

/** Where the card's title (the question) sits in the text, so it can be selected for typing. */
export function titleRange(text: string): { from: number; to: number } | null {
	const line = firstLine(text);
	const m = line.match(HEAD_RE);
	if (!m) return null;
	let from = m[0].length;
	while (from < line.length && (line[from] === ' ' || line[from] === '\t')) from++;
	return { from, to: line.length };
}
