// ===== Starting data =====
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// ===== 1. searchNotes(word) =====
// Returns an array of notes whose text contains word, ignoring case.
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

// ===== 2. longestNote() =====
// Returns the note with the most characters, or null if there are no notes.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// ===== 3. countByCategory() =====
// Returns an object counting notes per category.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

// ===== 4. getSummary() =====
// Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const word = notes.length === 1 ? "note" : "notes";
  const personal = counts.personal || 0;
  const work = counts.work || 0;
  const study = counts.study || 0;
  return `${notes.length} ${word}: ${personal} personal, ${work} work, ${study} study.`;
}

// ===== 5. isDuplicate(text) =====
// True if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase();
  return notes.some((note) => note.text.trim().toLowerCase() === cleaned);
}

// ===== 6. addNote(text, category) =====
// Adds a note if valid. Returns true when added, false otherwise.
function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Rejected: a note must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log(`Rejected: "${cleaned}" already exists.`);
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log(`Rejected: "${category}" is not personal, work or study.`);
    return false;
  }

  const nextId = notes.length === 0 ? 1 : Math.max(...notes.map((n) => n.id)) + 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  console.log(`Added: "${cleaned}" (${category})`);
  return true;
}

// ===================== TESTS =====================

// --- searchNotes ---
console.log(searchNotes("milk").length);        // 1
console.log(searchNotes("MILK")[0].text);       // Buy milk and bread
console.log(searchNotes("the").length);         // 2
console.log(searchNotes("zzz"));                // []

// --- longestNote ---
console.log(longestNote().text);                // Email the project report to Grace
const savedNotes = notes;
notes = [];
console.log(longestNote());                     // null
notes = savedNotes;

// --- countByCategory ---
console.log(countByCategory());                 // { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory());                 // {}
notes = savedNotes;

// --- getSummary ---
console.log(getSummary());                      // 5 notes: 2 personal, 1 work, 2 study.
notes = [savedNotes[0]];
console.log(getSummary());                      // 1 note: 1 personal, 0 work, 0 study.
notes = savedNotes;

// --- isDuplicate ---
console.log(isDuplicate("call mum"));           // true
console.log(isDuplicate("  BUY MILK AND BREAD  ")); // true
console.log(isDuplicate("Walk the dog"));       // false

// --- addNote ---
console.log(addNote("Plan weekend trip", "personal")); // Added: "Plan weekend trip" (personal) then true
console.log(addNote("  call MUM ", "personal"));       // Rejected: "call MUM" already exists. then false
console.log(addNote("Go dancing", "fun"));             // Rejected: "fun" is not personal, work or study. then false
console.log(addNote("   ", "work"));                  // Rejected: a note must be 1-200 characters. then false
console.log(addNote("a".repeat(201), "work"));        // Rejected: a note must be 1-200 characters. then false
console.log(getSummary());                            // 6 notes: 3 personal, 1 work, 2 study.
