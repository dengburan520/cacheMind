const STORAGE_KEY = "personal-notes:items";
const THEME_STORAGE_KEY = "personal-notes:theme";
const HEADING_STORAGE_KEY = "personal-notes:heading";
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024 * 1.5;

const noteForm = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const tagInput = document.getElementById("tag-input");
const noteInput = document.getElementById("note-input");
const createSnippetsContainer = document.getElementById("create-snippets");
const addSnippetButton = document.getElementById("add-snippet-btn");
const imageInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const removeImageButton = document.getElementById("remove-image-btn");
const themeColorInput = document.getElementById("theme-color-input");
const surfaceColorInput = document.getElementById("surface-color-input");
const themeOverlayInput = document.getElementById("theme-overlay-input");
const themeOverlayValue = document.getElementById("theme-overlay-value");
const noteOpacityInput = document.getElementById("note-opacity-input");
const noteOpacityValue = document.getElementById("note-opacity-value");
const editorOpacityInput = document.getElementById("editor-opacity-input");
const editorOpacityValue = document.getElementById("editor-opacity-value");
const themeImageInput = document.getElementById("theme-image-input");
const themePreview = document.getElementById("theme-preview");
const themeFilterControls = document.getElementById("theme-filter-controls");
const removeThemeImageButton = document.getElementById("remove-theme-image-btn");
const resetThemeButton = document.getElementById("reset-theme-btn");
const authCopy = document.getElementById("auth-copy");
const authSetupCopy = document.getElementById("auth-setup-copy");
const authFields = document.getElementById("auth-fields");
const authEmailInput = document.getElementById("auth-email-input");
const authSignInButton = document.getElementById("auth-sign-in-btn");
const authSignOutButton = document.getElementById("auth-sign-out-btn");
const searchInput = document.getElementById("search-input");
const notesHeadingInput = document.getElementById("notes-heading-input");
const notesContainer = document.getElementById("notes");
const totalCount = document.getElementById("total-count");
const latestUpdate = document.getElementById("latest-update");
const statusMessage = document.getElementById("status-message");
const clearButton = document.getElementById("clear-btn");
const cancelButton = document.getElementById("cancel-btn");
const submitButton = document.getElementById("submit-btn");
const formMode = document.getElementById("form-mode");

let notes = loadNotes();
let editingNoteId = null;
let inlineEditDraft = null;
let editingSnippet = null;
let currentImageData = "";
let currentImageName = "";
let createSnippets = [createEmptySnippet()];
let themeSettings = loadThemeSettings();
let notesHeading = loadNotesHeading();
const supabaseConfig = getSupabaseConfig();
const supabaseClient = canUseSupabase()
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
let currentUser = null;

renderCreateSnippets();
renderNotes();
updateSummary();
syncFormMode();
renderImagePreview();
applyTheme();
renderThemePreview();
applyNotesHeading();
updateAuthUi();
initializeCloudNotes();

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isCloudConfigured() && !currentUser) {
    setStatus("Sign in first so we know which notes belong to you.");
    return;
  }

  const title = titleInput.value.trim();
  const body = noteInput.value.trim();
  const tag = tagInput.value.trim();
  const snippets = getCleanSnippets(captureCreateSnippetsFromDom());

  if (!title || !body) {
    setStatus("Add both a title and a note description.");
    return;
  }

  const note = {
    id: crypto.randomUUID(),
    title,
    body,
    tag,
    snippets,
    imageData: currentImageData,
    imageName: currentImageName,
    updatedAt: new Date().toISOString(),
  };

  try {
    const savedNote = await createNoteInStore(note);
    notes.unshift(savedNote);
  } catch (error) {
    console.error("Could not create note", error);
    setStatus("That note could not be saved right now.");
    return;
  }

  renderNotes();
  updateSummary();
  setStatus(`Saved "${title}".`);
  resetForm();
});

searchInput.addEventListener("input", () => {
  renderNotes();
  updateSummary();
});

authSignInButton.addEventListener("click", async () => {
  const email = authEmailInput.value.trim();
  if (!isCloudConfigured()) {
    setStatus("Supabase is not configured yet.");
    return;
  }

  if (!email) {
    setStatus("Add your email address to receive a login link.");
    return;
  }

  authSignInButton.disabled = true;
  try {
    const redirectUrl = getAuthRedirectUrl();
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: redirectUrl ? { emailRedirectTo: redirectUrl } : {},
    });
    if (error) {
      throw error;
    }

    setStatus(`Login link sent to ${email}.`);
  } catch (error) {
    console.error("Could not send login link", error);
    setStatus("Login link could not be sent. Check your Supabase auth settings.");
  } finally {
    authSignInButton.disabled = false;
  }
});

authSignOutButton.addEventListener("click", async () => {
  if (!supabaseClient) {
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Could not sign out", error);
    setStatus("Sign out did not complete.");
  }
});

notesHeadingInput.addEventListener("input", () => {
  notesHeading = notesHeadingInput.value;
  persistNotesHeading();
});

notesHeadingInput.addEventListener("focus", () => {
  notesHeadingInput.select();
});

notesHeadingInput.addEventListener("blur", () => {
  notesHeading = notesHeadingInput.value.trim() || "Notes";
  applyNotesHeading();
  persistNotesHeading();
});

notesHeadingInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    notesHeadingInput.blur();
  }
});

addSnippetButton.addEventListener("click", () => {
  createSnippets = [...captureCreateSnippetsFromDom(), createEmptySnippet()];
  renderCreateSnippets();
  focusCreateSnippet(createSnippets.at(-1)?.id);
});

createSnippetsContainer.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-create-snippet-id]");
  if (!removeButton) {
    return;
  }

  const snippetId = removeButton.dataset.removeCreateSnippetId;
  const nextSnippets = captureCreateSnippetsFromDom().filter((snippet) => snippet.id !== snippetId);
  createSnippets = nextSnippets.length > 0 ? nextSnippets : [createEmptySnippet()];
  renderCreateSnippets();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) {
    return;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    imageInput.value = "";
    setStatus("Image is too large. Please choose one smaller than 1.5 MB.");
    return;
  }

  try {
    currentImageData = await readFileAsDataUrl(file);
    currentImageName = file.name;
    renderImagePreview();
    setStatus(`Attached image "${file.name}".`);
  } catch (error) {
    console.error("Could not read image", error);
    imageInput.value = "";
    setStatus("That image could not be loaded.");
  }
});

removeImageButton.addEventListener("click", () => {
  currentImageData = "";
  currentImageName = "";
  imageInput.value = "";
  renderImagePreview();
  setStatus("Image removed from the current note.");
});

themeColorInput.addEventListener("input", () => {
  themeSettings.color = themeColorInput.value;
  applyTheme();
  persistThemeSettings();
});

surfaceColorInput.addEventListener("input", () => {
  themeSettings.surfaceColor = surfaceColorInput.value;
  applyTheme();
  persistThemeSettings();
});

themeOverlayInput.addEventListener("input", () => {
  themeSettings.overlayStrength = Number(themeOverlayInput.value) / 100;
  applyTheme();
  persistThemeSettings();
});

noteOpacityInput.addEventListener("input", () => {
  themeSettings.noteOpacity = Number(noteOpacityInput.value) / 100;
  applyTheme();
  persistThemeSettings();
});

editorOpacityInput.addEventListener("input", () => {
  themeSettings.editorOpacity = Number(editorOpacityInput.value) / 100;
  applyTheme();
  persistThemeSettings();
});

themeImageInput.addEventListener("change", async () => {
  const file = themeImageInput.files?.[0];
  if (!file) {
    return;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    themeImageInput.value = "";
    setStatus("Background image is too large. Please choose one smaller than 1.5 MB.");
    return;
  }

  try {
    themeSettings.imageData = await readFileAsDataUrl(file);
    themeSettings.imageName = file.name;
    applyTheme();
    renderThemePreview();
    persistThemeSettings();
    setStatus(`Theme background updated with "${file.name}".`);
  } catch (error) {
    console.error("Could not read theme image", error);
    themeImageInput.value = "";
    setStatus("That background image could not be loaded.");
  }
});

removeThemeImageButton.addEventListener("click", () => {
  themeSettings.imageData = "";
  themeSettings.imageName = "";
  themeImageInput.value = "";
  applyTheme();
  renderThemePreview();
  persistThemeSettings();
  setStatus("Custom background image removed.");
});

resetThemeButton.addEventListener("click", () => {
  themeSettings = getDefaultThemeSettings();
  themeColorInput.value = themeSettings.color;
  surfaceColorInput.value = themeSettings.surfaceColor;
  themeOverlayInput.value = String(Math.round(themeSettings.overlayStrength * 100));
  noteOpacityInput.value = String(Math.round(themeSettings.noteOpacity * 100));
  editorOpacityInput.value = String(Math.round(themeSettings.editorOpacity * 100));
  themeImageInput.value = "";
  applyTheme();
  renderThemePreview();
  persistThemeSettings();
  setStatus("Theme reset to default.");
});

clearButton.addEventListener("click", async () => {
  if (notes.length === 0) {
    setStatus("There are no notes to clear.");
    return;
  }

  try {
    await clearNotesInStore();
  } catch (error) {
    console.error("Could not clear notes", error);
    setStatus("Notes could not be cleared right now.");
    return;
  }

  notes = [];
  editingNoteId = null;
  inlineEditDraft = null;
  editingSnippet = null;
  resetForm();
  renderNotes();
  updateSummary();
  setStatus("All notes were cleared.");
});

cancelButton.addEventListener("click", () => {
  resetForm();
  setStatus("Create form cleared.");
});

notesContainer.addEventListener("click", async (event) => {
  const saveSnippetButton = event.target.closest("[data-save-snippet-id]");
  if (saveSnippetButton) {
    await saveSnippetEdit(
      saveSnippetButton.dataset.snippetNoteId,
      saveSnippetButton.dataset.saveSnippetId
    );
    return;
  }

  const cancelSnippetButton = event.target.closest("[data-cancel-snippet-id]");
  if (cancelSnippetButton) {
    cancelSnippetEdit();
    return;
  }

  const editSnippetButton = event.target.closest("[data-edit-snippet-id]");
  if (editSnippetButton) {
    event.preventDefault();
    startSnippetEdit(
      editSnippetButton.dataset.snippetNoteId,
      editSnippetButton.dataset.editSnippetId
    );
    return;
  }

  const saveButton = event.target.closest("[data-save-edit-id]");
  if (saveButton) {
    await saveInlineEdit(saveButton.dataset.saveEditId);
    return;
  }

  const cancelEditButton = event.target.closest("[data-cancel-edit-id]");
  if (cancelEditButton) {
    cancelInlineEdit(cancelEditButton.dataset.cancelEditId);
    return;
  }

  const removeInlineImageButton = event.target.closest("[data-remove-inline-image-id]");
  if (removeInlineImageButton) {
    removeInlineEditImage(removeInlineImageButton.dataset.removeInlineImageId);
    return;
  }

  const addInlineSnippetButton = event.target.closest("[data-add-inline-snippet-id]");
  if (addInlineSnippetButton) {
    addInlineSnippet(addInlineSnippetButton.dataset.addInlineSnippetId);
    return;
  }

  const removeInlineSnippetButton = event.target.closest("[data-remove-inline-snippet-id]");
  if (removeInlineSnippetButton) {
    removeInlineSnippet(
      removeInlineSnippetButton.dataset.removeInlineSnippetNoteId,
      removeInlineSnippetButton.dataset.removeInlineSnippetId
    );
    return;
  }

  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    startEditing(editButton.dataset.editId);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) {
    return;
  }

  const noteId = deleteButton.dataset.deleteId;
  const targetNote = notes.find((note) => note.id === noteId);
  const nextNotes = notes.filter((note) => note.id !== noteId);

  if (editingNoteId === noteId) {
    editingNoteId = null;
    inlineEditDraft = null;
  }
  if (editingSnippet?.noteId === noteId) {
    editingSnippet = null;
  }

  try {
    await deleteNoteFromStore(noteId);
  } catch (error) {
    console.error("Could not delete note", error);
    setStatus("That note could not be deleted right now.");
    return;
  }

  notes = nextNotes;
  renderNotes();
  updateSummary();
  setStatus(targetNote ? `Deleted "${targetNote.title}".` : "Note deleted.");
});

notesContainer.addEventListener("change", async (event) => {
  const inlineImageInput = event.target.closest("[data-inline-image-input-id]");
  if (!inlineImageInput) {
    return;
  }

  const noteId = inlineImageInput.dataset.inlineImageInputId;
  const file = inlineImageInput.files?.[0];
  if (!file) {
    return;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    inlineImageInput.value = "";
    setStatus("Image is too large. Please choose one smaller than 1.5 MB.");
    return;
  }

  try {
    captureInlineDraft(noteId);
    inlineEditDraft.imageData = await readFileAsDataUrl(file);
    inlineEditDraft.imageName = file.name;
    renderNotes();
    focusInlineTitle(noteId);
    setStatus(`Attached image "${file.name}" to the note.`);
  } catch (error) {
    console.error("Could not read inline image", error);
    setStatus("That image could not be loaded.");
  }
});

function renderCreateSnippets() {
  createSnippetsContainer.innerHTML = createSnippets
    .map((snippet, index) => renderSnippetEditor(snippet, index, "create"))
    .join("");
}

function renderNotes() {
  const filteredNotes = getFilteredNotes();

  if (filteredNotes.length === 0) {
    const emptyMessage = notes.length === 0
      ? "Your notes will appear here. Start with an idea, a code snippet, or an image."
      : "No notes match your current search.";

    notesContainer.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  notesContainer.innerHTML = filteredNotes
    .map((note) => (editingNoteId === note.id ? renderInlineEditCard(note) : renderCard(note)))
    .join("");
}

function renderCard(note) {
  const tagMarkup = note.tag ? `<span class="pill">${escapeHtml(note.tag)}</span>` : "";
  const imageMarkup = note.imageData
    ? `
      <div class="note-image-wrap">
        <img class="note-image" src="${escapeAttribute(note.imageData)}" alt="${escapeAttribute(note.imageName || note.title)}" />
      </div>
    `
    : "";
  const snippetsMarkup = renderSavedSnippets(note);

  return `
    <details class="note-card note-card-collapsible" id="${note.id}" open>
      <summary class="note-summary">
        <div class="note-top">
          <div>
            <h3 class="note-title">${escapeHtml(note.title)}</h3>
            <p class="note-copy">${escapeHtml(formatDate(note.updatedAt))}</p>
          </div>
          <div class="note-summary-side">
            ${tagMarkup}
            <span class="note-toggle-text" aria-hidden="true"></span>
          </div>
        </div>
      </summary>
      <div class="note-details-body">
        <p class="note-body">${escapeHtml(note.body)}</p>
        ${imageMarkup}
        ${snippetsMarkup}
        <div class="note-actions">
          <button type="button" class="text-btn" data-edit-id="${note.id}">Edit Note</button>
          <button type="button" class="text-btn" data-delete-id="${note.id}">Delete</button>
        </div>
      </div>
    </details>
  `;
}

function renderInlineEditCard(note) {
  const draft = inlineEditDraft || note;
  const imagePreviewMarkup = draft.imageData
    ? `
      <div class="note-image-wrap inline-image-wrap">
        <img class="note-image" src="${escapeAttribute(draft.imageData)}" alt="${escapeAttribute(draft.imageName || draft.title)}" />
      </div>
      <p class="note-copy inline-preview-copy">${escapeHtml(draft.imageName || "Attached image")}</p>
    `
    : `<div class="empty-state inline-empty-state">No image attached.</div>`;

  return `
    <article class="note-card note-card-editing" id="${note.id}">
      <div class="inline-edit-badge">Editing Here</div>
      <div class="inline-edit-grid">
        <label class="field inline-field">
          <span>Title</span>
          <input data-inline-title-id="${note.id}" type="text" value="${escapeAttribute(draft.title)}" />
        </label>

        <label class="field inline-field">
          <span>Tag</span>
          <input data-inline-tag-id="${note.id}" type="text" value="${escapeAttribute(draft.tag)}" />
        </label>

        <label class="field inline-field inline-field-wide">
          <span>Note description</span>
          <textarea data-inline-body-id="${note.id}" rows="5">${escapeHtml(draft.body)}</textarea>
        </label>

        <section class="upload-card inline-upload-card inline-field-wide">
          <div class="section-head">
            <p class="eyebrow">Image</p>
            <h3>Edit image here</h3>
          </div>

          <label class="upload-dropzone" for="inline-image-${note.id}">
            <input id="inline-image-${note.id}" data-inline-image-input-id="${note.id}" type="file" accept="image/*" hidden />
            <span class="upload-title">Choose a new image</span>
            <span class="upload-copy">Upload a replacement or keep the current image.</span>
          </label>

          <div class="inline-image-panel">
            ${imagePreviewMarkup}
          </div>

          <div class="note-actions">
            <button type="button" class="text-btn" data-remove-inline-image-id="${note.id}">Remove Image</button>
          </div>
        </section>
      </div>

      <div class="note-actions note-actions-inline">
        <button type="button" class="primary-btn inline-save-btn" data-save-edit-id="${note.id}">Save Changes</button>
        <button type="button" class="secondary-btn" data-cancel-edit-id="${note.id}">Cancel</button>
      </div>
    </article>
  `;
}

function renderSnippetEditor(snippet, index, mode, noteId = "") {
  const removeMarkup = mode === "create"
    ? `<button type="button" class="text-btn snippet-remove-btn" data-remove-create-snippet-id="${snippet.id}">Remove</button>`
    : `<button type="button" class="text-btn snippet-remove-btn" data-remove-inline-snippet-note-id="${noteId}" data-remove-inline-snippet-id="${snippet.id}">Remove</button>`;

  return `
    <section class="snippet-editor-card">
      <div class="snippet-editor-head">
        <div>
          <p class="code-label">Snippet ${index + 1}</p>
          <h4>${escapeHtml(snippet.title || "Untitled code block")}</h4>
        </div>
        ${removeMarkup}
      </div>

      <label class="field inline-field">
        <span>Code title</span>
        <input data-snippet-title-id="${snippet.id}" type="text" value="${escapeAttribute(snippet.title)}" placeholder="Login helper, API example, SQL query..." />
      </label>

      <label class="field inline-field">
        <span>Code description</span>
        <textarea data-snippet-description-id="${snippet.id}" rows="3" placeholder="Explain what this code does or why you saved it...">${escapeHtml(snippet.description)}</textarea>
      </label>

      <label class="field inline-field">
        <span>Code</span>
        <textarea data-snippet-code-id="${snippet.id}" class="code-input snippet-code-input" rows="8" placeholder="Paste your code here..." spellcheck="false">${escapeHtml(snippet.code)}</textarea>
      </label>
    </section>
  `;
}

function renderSavedSnippets(note) {
  const cleanSnippets = getCleanSnippets(note.snippets || []);
  if (cleanSnippets.length === 0) {
    return "";
  }

  return `
    <section class="snippet-list">
      ${cleanSnippets.map((snippet, index) => {
        if (editingSnippet?.noteId === note.id && editingSnippet.snippetId === snippet.id) {
          return renderTargetSnippetEditor(note.id, editingSnippet.draft, index);
        }

        return `
        <details class="code-block saved-code-block">
          <summary class="saved-code-summary">
            <div>
              <p class="code-label">Code Snippet ${index + 1}</p>
              <h4>${escapeHtml(snippet.title || `Code block ${index + 1}`)}</h4>
            </div>
            <div class="saved-code-controls">
              <button
                type="button"
                class="text-btn snippet-edit-btn"
                data-snippet-note-id="${note.id}"
                data-edit-snippet-id="${snippet.id}"
              >
                Edit
              </button>
              <span class="snippet-toggle" aria-hidden="true"></span>
            </div>
          </summary>
          ${snippet.description ? `<p class="note-copy">${escapeHtml(snippet.description)}</p>` : ""}
          ${snippet.code.trim() ? `<pre class="code-snippet"><code>${escapeHtml(snippet.code)}</code></pre>` : ""}
        </details>
      `;
      }).join("")}
    </section>
  `;
}

function renderTargetSnippetEditor(noteId, snippet, index) {
  return `
    <section class="snippet-editor-card target-snippet-editor">
      <div class="snippet-editor-head">
        <div>
          <p class="code-label">Editing Snippet ${index + 1}</p>
          <h4>${escapeHtml(snippet.title || "Untitled code block")}</h4>
        </div>
      </div>

      <label class="field inline-field">
        <span>Code title</span>
        <input data-target-snippet-title type="text" value="${escapeAttribute(snippet.title)}" />
      </label>

      <label class="field inline-field">
        <span>Code description</span>
        <textarea data-target-snippet-description rows="3">${escapeHtml(snippet.description)}</textarea>
      </label>

      <label class="field inline-field">
        <span>Code</span>
        <textarea data-target-snippet-code class="code-input snippet-code-input" rows="12" spellcheck="false">${escapeHtml(snippet.code)}</textarea>
      </label>

      <div class="note-actions note-actions-inline">
        <button
          type="button"
          class="primary-btn inline-save-btn"
          data-snippet-note-id="${noteId}"
          data-save-snippet-id="${snippet.id}"
        >
          Save Snippet
        </button>
        <button type="button" class="secondary-btn" data-cancel-snippet-id="${snippet.id}">
          Cancel
        </button>
      </div>
    </section>
  `;
}

function getFilteredNotes() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    return notes;
  }

  return notes.filter((note) =>
    [
      note.title,
      note.body,
      note.tag,
      note.imageName,
      ...(note.snippets || []).flatMap((snippet) => [snippet.title, snippet.description, snippet.code]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
}

function updateSummary() {
  const filteredNotes = getFilteredNotes();
  totalCount.textContent = `${filteredNotes.length} note${filteredNotes.length === 1 ? "" : "s"}`;
  latestUpdate.textContent = notes[0] ? formatDate(notes[0].updatedAt) : "No notes yet";
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeNote) : [];
  } catch (error) {
    console.error("Could not load saved notes", error);
    return [];
  }
}

function loadThemeSettings() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeThemeSettings(parsed);
  } catch (error) {
    console.error("Could not load theme settings", error);
    return getDefaultThemeSettings();
  }
}

function loadNotesHeading() {
  try {
    return localStorage.getItem(HEADING_STORAGE_KEY) || "Notes";
  } catch (error) {
    console.error("Could not load notes heading", error);
    return "Notes";
  }
}

function saveNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch (error) {
    console.error("Could not save notes", error);
    setStatus("Notes could not be saved. Try using a smaller image or fewer large notes.");
    return false;
  }
}

function saveNotesWithSnapshot(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.error("Could not save saved notes snapshot", error);
    setStatus("Notes could not be saved. Try using a smaller image or fewer large notes.");
    return false;
  }
}

function persistThemeSettings() {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeSettings));
  } catch (error) {
    console.error("Could not save theme settings", error);
    setStatus("Theme could not be saved. Try a smaller background image.");
  }
}

function persistNotesHeading() {
  try {
    localStorage.setItem(HEADING_STORAGE_KEY, notesHeading);
  } catch (error) {
    console.error("Could not save notes heading", error);
  }
}

function getSupabaseConfig() {
  const config = window.NOTES_APP_CONFIG?.supabase;
  return {
    url: typeof config?.url === "string" ? config.url.trim() : "",
    anonKey: typeof config?.anonKey === "string" ? config.anonKey.trim() : "",
  };
}

function canUseSupabase() {
  return Boolean(window.supabase?.createClient && supabaseConfig.url && supabaseConfig.anonKey);
}

function isCloudConfigured() {
  return Boolean(supabaseClient);
}

function isCloudSessionActive() {
  return Boolean(supabaseClient && currentUser);
}

function getAuthRedirectUrl() {
  if (window.location.protocol === "file:") {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function updateAuthUi() {
  if (!supabaseClient) {
    authCopy.textContent = "This app is currently using only browser storage on this device.";
    authSetupCopy.hidden = false;
    authFields.hidden = true;
    setComposerDisabled(false);
    return;
  }

  authSetupCopy.hidden = true;
  authFields.hidden = false;

  if (currentUser) {
    authCopy.textContent = `Signed in as ${currentUser.email || "your account"}. Your notes are now private to this user.`;
    authSignInButton.hidden = true;
    authSignOutButton.hidden = false;
    authEmailInput.disabled = true;
    setComposerDisabled(false);
    return;
  }

  authCopy.textContent = "Sign in to load your own notes from Supabase and keep them across devices.";
  authSignInButton.hidden = false;
  authSignOutButton.hidden = true;
  authEmailInput.disabled = false;
  setComposerDisabled(true);
}

function setComposerDisabled(disabled) {
  noteForm.classList.toggle("is-disabled", disabled);
  const fields = noteForm.querySelectorAll("input, textarea, button");
  for (const field of fields) {
    if (field.id === "cancel-btn" || field.id === "clear-btn" || field.id === "submit-btn" || field.id === "add-snippet-btn" || field.id === "image-input") {
      field.disabled = disabled;
      continue;
    }

    field.disabled = disabled;
  }

  imageInput.disabled = disabled;
  addSnippetButton.disabled = disabled;
  submitButton.disabled = disabled;
  clearButton.disabled = disabled;
  cancelButton.disabled = disabled;
}

async function initializeCloudNotes() {
  if (!supabaseClient) {
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      throw error;
    }

    currentUser = data.session?.user ?? null;
    updateAuthUi();

    if (currentUser) {
      await refreshNotesFromRemote();
      setStatus(`Loaded notes for ${currentUser.email || "your account"}.`);
    } else {
      notes = [];
      renderNotes();
      updateSummary();
      setStatus("Sign in to start using your own cloud notes.");
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session).catch((error) => {
        console.error("Could not handle auth state change", error);
        setStatus("Account state changed, but notes could not refresh.");
      });
    });
  } catch (error) {
    console.error("Could not initialize Supabase", error);
    setStatus("Supabase is configured, but the connection could not start.");
  }
}

async function handleAuthStateChange(event, session) {
  currentUser = session?.user ?? null;
  editingNoteId = null;
  inlineEditDraft = null;
  editingSnippet = null;
  resetForm();
  updateAuthUi();

  if (!currentUser) {
    notes = [];
    renderNotes();
    updateSummary();
    setStatus(event === "SIGNED_OUT" ? "Signed out. Your cloud notes are hidden until you log back in." : "Sign in to access your cloud notes.");
    return;
  }

  await refreshNotesFromRemote();
  setStatus(event === "SIGNED_IN" ? `Signed in as ${currentUser.email || "your account"}.` : "Cloud notes refreshed.");
}

async function refreshNotesFromRemote() {
  if (!isCloudSessionActive()) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("notes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  notes = (data || []).map(normalizeRemoteNote);
  renderNotes();
  updateSummary();
}

async function createNoteInStore(note) {
  if (!isCloudSessionActive()) {
    if (!saveNotesWithSnapshot([note, ...notes])) {
      throw new Error("Local save failed");
    }
    return note;
  }

  const { data, error } = await supabaseClient
    .from("notes")
    .insert(noteToRecord(note))
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeRemoteNote(data);
}

async function updateNoteInStore(note) {
  if (!isCloudSessionActive()) {
    if (!saveNotes()) {
      throw new Error("Local save failed");
    }
    return;
  }

  const { error } = await supabaseClient
    .from("notes")
    .update(noteToRecord(note))
    .eq("id", note.id);

  if (error) {
    throw error;
  }
}

async function deleteNoteFromStore(noteId) {
  if (!isCloudSessionActive()) {
    if (!saveNotesWithSnapshot(notes.filter((note) => note.id !== noteId))) {
      throw new Error("Local delete failed");
    }
    return;
  }

  const { error } = await supabaseClient
    .from("notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    throw error;
  }
}

async function clearNotesInStore() {
  if (!isCloudSessionActive()) {
    if (!saveNotesWithSnapshot([])) {
      throw new Error("Local clear failed");
    }
    return;
  }

  const { error } = await supabaseClient
    .from("notes")
    .delete()
    .not("id", "is", null);

  if (error) {
    throw error;
  }
}

function noteToRecord(note) {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    tag: note.tag,
    snippets: getCleanSnippets(note.snippets),
    image_data: note.imageData || "",
    image_name: note.imageName || "",
    updated_at: note.updatedAt,
  };
}

function normalizeRemoteNote(record) {
  return normalizeNote({
    id: record.id,
    title: record.title,
    body: record.body,
    tag: record.tag,
    snippets: record.snippets,
    imageData: record.image_data,
    imageName: record.image_name,
    updatedAt: record.updated_at,
  });
}

function startEditing(noteId) {
  const targetNote = notes.find((note) => note.id === noteId);
  if (!targetNote) {
    setStatus("That note could not be found.");
    return;
  }

  editingNoteId = noteId;
  inlineEditDraft = structuredCloneNote(targetNote);
  editingSnippet = null;
  renderNotes();
  focusInlineTitle(noteId);
  setStatus(`Editing "${targetNote.title}" directly in the note.`);
}

async function saveInlineEdit(noteId) {
  captureInlineDraft(noteId);

  if (!inlineEditDraft) {
    setStatus("That note could not be found.");
    return;
  }

  const title = inlineEditDraft.title.trim();
  const body = inlineEditDraft.body.trim();
  if (!title || !body) {
    setStatus("Add both a title and a note description before saving.");
    return;
  }

  const targetNote = notes.find((note) => note.id === noteId);
  if (!targetNote) {
    setStatus("That note could not be found.");
    return;
  }

  Object.assign(targetNote, {
    ...inlineEditDraft,
    title,
    body,
    snippets: getCleanSnippets(inlineEditDraft.snippets),
    updatedAt: new Date().toISOString(),
  });

  try {
    await updateNoteInStore(targetNote);
  } catch (error) {
    console.error("Could not update note", error);
    setStatus("That note could not be updated right now.");
    return;
  }

  editingNoteId = null;
  inlineEditDraft = null;
  renderNotes();
  updateSummary();
  setStatus(`Updated "${title}".`);
}

function cancelInlineEdit(noteId) {
  const targetNote = notes.find((note) => note.id === noteId);
  editingNoteId = null;
  inlineEditDraft = null;
  renderNotes();
  setStatus(targetNote ? `Cancelled editing "${targetNote.title}".` : "Edit cancelled.");
}

function startSnippetEdit(noteId, snippetId) {
  const targetNote = notes.find((note) => note.id === noteId);
  const targetSnippet = targetNote?.snippets.find((snippet) => snippet.id === snippetId);
  if (!targetNote || !targetSnippet) {
    setStatus("That code snippet could not be found.");
    return;
  }

  editingSnippet = {
    noteId,
    snippetId,
    draft: { ...targetSnippet },
  };
  renderNotes();
  document.querySelector("[data-target-snippet-title]")?.focus();
  setStatus(`Editing only "${targetSnippet.title || "this code snippet"}".`);
}

async function saveSnippetEdit(noteId, snippetId) {
  if (editingSnippet?.noteId !== noteId || editingSnippet.snippetId !== snippetId) {
    setStatus("That code snippet could not be found.");
    return;
  }

  const editor = document.querySelector(".target-snippet-editor");
  const targetNote = notes.find((note) => note.id === noteId);
  const targetSnippet = targetNote?.snippets.find((snippet) => snippet.id === snippetId);
  if (!editor || !targetNote || !targetSnippet) {
    setStatus("That code snippet could not be found.");
    return;
  }

  Object.assign(targetSnippet, {
    title: editor.querySelector("[data-target-snippet-title]")?.value.trim() || "",
    description: editor.querySelector("[data-target-snippet-description]")?.value.trim() || "",
    code: editor.querySelector("[data-target-snippet-code]")?.value || "",
  });
  targetNote.updatedAt = new Date().toISOString();

  try {
    await updateNoteInStore(targetNote);
  } catch (error) {
    console.error("Could not update code snippet", error);
    setStatus("That code snippet could not be updated right now.");
    return;
  }

  editingSnippet = null;
  renderNotes();
  updateSummary();
  setStatus(`Updated "${targetSnippet.title || "code snippet"}".`);
}

function cancelSnippetEdit() {
  editingSnippet = null;
  renderNotes();
  setStatus("Code snippet edit cancelled.");
}

function addInlineSnippet(noteId) {
  captureInlineDraft(noteId);
  inlineEditDraft.snippets = [...(inlineEditDraft?.snippets || []), createEmptySnippet()];
  renderNotes();
  focusInlineSnippet(inlineEditDraft.snippets.at(-1)?.id);
}

function removeInlineSnippet(noteId, snippetId) {
  captureInlineDraft(noteId);
  const nextSnippets = (inlineEditDraft?.snippets || []).filter((snippet) => snippet.id !== snippetId);
  inlineEditDraft.snippets = nextSnippets.length > 0 ? nextSnippets : [createEmptySnippet()];
  renderNotes();
}

function removeInlineEditImage(noteId) {
  captureInlineDraft(noteId);
  if (!inlineEditDraft) {
    return;
  }

  inlineEditDraft.imageData = "";
  inlineEditDraft.imageName = "";
  renderNotes();
  focusInlineTitle(noteId);
  setStatus("Image removed from the note.");
}

function captureInlineDraft(noteId) {
  if (editingNoteId !== noteId) {
    return;
  }

  const noteCard = document.getElementById(noteId);
  if (!noteCard) {
    return;
  }

  inlineEditDraft = {
    ...(inlineEditDraft || {}),
    id: noteId,
    title: noteCard.querySelector(`[data-inline-title-id="${noteId}"]`)?.value ?? "",
    tag: noteCard.querySelector(`[data-inline-tag-id="${noteId}"]`)?.value ?? "",
    body: noteCard.querySelector(`[data-inline-body-id="${noteId}"]`)?.value ?? "",
    snippets: collectSnippetsFromRoot(noteCard, inlineEditDraft?.snippets || []),
    imageData: inlineEditDraft?.imageData || "",
    imageName: inlineEditDraft?.imageName || "",
  };
}

function captureCreateSnippetsFromDom() {
  return collectSnippetsFromRoot(createSnippetsContainer, createSnippets);
}

function collectSnippetsFromRoot(root, fallbackSnippets) {
  return fallbackSnippets.map((snippet) => ({
    id: snippet.id,
    title: root.querySelector(`[data-snippet-title-id="${snippet.id}"]`)?.value ?? snippet.title ?? "",
    description: root.querySelector(`[data-snippet-description-id="${snippet.id}"]`)?.value ?? snippet.description ?? "",
    code: root.querySelector(`[data-snippet-code-id="${snippet.id}"]`)?.value ?? snippet.code ?? "",
  }));
}

function focusInlineTitle(noteId) {
  const titleField = document.querySelector(`[data-inline-title-id="${noteId}"]`);
  titleField?.focus();
}

function focusInlineSnippet(snippetId) {
  const snippetField = document.querySelector(`[data-snippet-title-id="${snippetId}"]`);
  snippetField?.focus();
}

function focusCreateSnippet(snippetId) {
  const snippetField = createSnippetsContainer.querySelector(`[data-snippet-title-id="${snippetId}"]`);
  snippetField?.focus();
}

function resetForm() {
  noteForm.reset();
  currentImageData = "";
  currentImageName = "";
  createSnippets = [createEmptySnippet()];
  imageInput.value = "";
  renderCreateSnippets();
  renderImagePreview();
  syncFormMode();
}

function syncFormMode() {
  submitButton.textContent = "Save Note";
  cancelButton.hidden = true;
  formMode.hidden = true;
}

function renderImagePreview() {
  if (!currentImageData) {
    imagePreview.className = "image-preview empty";
    imagePreview.innerHTML = `<p class="preview-placeholder">No image selected yet.</p>`;
    removeImageButton.hidden = true;
    return;
  }

  imagePreview.className = "image-preview";
  imagePreview.innerHTML = `
    <img src="${escapeAttribute(currentImageData)}" alt="${escapeAttribute(currentImageName || "Attached image")}" />
    <p class="preview-caption">${escapeHtml(currentImageName || "Attached image")}</p>
  `;
  removeImageButton.hidden = false;
}

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty("--custom-bg-color", themeSettings.color);
  root.style.setProperty("--custom-bg-rgb", hexToRgb(themeSettings.color));
  root.style.setProperty("--custom-surface-rgb", hexToRgb(themeSettings.surfaceColor));
  root.style.setProperty("--theme-overlay-opacity", themeSettings.overlayStrength.toFixed(2));
  root.style.setProperty("--note-panel-opacity", themeSettings.noteOpacity.toFixed(2));

  if (themeSettings.imageData) {
    root.style.setProperty("--custom-bg-image", `url("${themeSettings.imageData}")`);
    root.style.setProperty("--background-color-opacity", "0");
    root.style.setProperty("--surface-visibility", "0");
    root.style.setProperty("--editor-overlay-opacity", themeSettings.editorOpacity.toFixed(2));
    themeFilterControls.hidden = true;
  } else {
    root.style.setProperty("--custom-bg-image", "none");
    root.style.setProperty("--background-color-opacity", "1");
    root.style.setProperty("--surface-visibility", "1");
    root.style.setProperty("--editor-overlay-opacity", "0");
    themeFilterControls.hidden = false;
  }

  themeColorInput.value = themeSettings.color;
  surfaceColorInput.value = themeSettings.surfaceColor;
  themeOverlayInput.value = String(Math.round(themeSettings.overlayStrength * 100));
  noteOpacityInput.value = String(Math.round(themeSettings.noteOpacity * 100));
  editorOpacityInput.value = String(Math.round(themeSettings.editorOpacity * 100));
  themeOverlayValue.textContent = `${Math.round(themeSettings.overlayStrength * 100)}%`;
  noteOpacityValue.textContent = `${Math.round(themeSettings.noteOpacity * 100)}%`;
  editorOpacityValue.textContent = `${Math.round(themeSettings.editorOpacity * 100)}%`;
}

function applyNotesHeading() {
  notesHeadingInput.value = notesHeading;
}

function renderThemePreview() {
  if (!themeSettings.imageData) {
    themePreview.className = "theme-preview empty";
    themePreview.innerHTML = `<p class="preview-placeholder">No custom background image selected.</p>`;
    removeThemeImageButton.hidden = true;
    return;
  }

  themePreview.className = "theme-preview";
  themePreview.innerHTML = `
    <img src="${escapeAttribute(themeSettings.imageData)}" alt="${escapeAttribute(themeSettings.imageName || "Theme background")}" />
    <p class="preview-caption">${escapeHtml(themeSettings.imageName || "Theme background")}</p>
  `;
  removeThemeImageButton.hidden = false;
}

function normalizeNote(note) {
  const snippets = Array.isArray(note.snippets)
    ? note.snippets.map(normalizeSnippet)
    : getLegacySnippets(note);

  return {
    id: note.id || crypto.randomUUID(),
    title: note.title || "",
    body: note.body || "",
    tag: note.tag || "",
    snippets,
    imageData: note.imageData || "",
    imageName: note.imageName || "",
    updatedAt: note.updatedAt || new Date().toISOString(),
  };
}

function normalizeSnippet(snippet) {
  return {
    id: snippet.id || crypto.randomUUID(),
    title: snippet.title || "",
    description: snippet.description || "",
    code: snippet.code || "",
  };
}

function getLegacySnippets(note) {
  if (!note.codeTitle && !note.codeDescription && !note.codeSnippet) {
    return [];
  }

  return [{
    id: crypto.randomUUID(),
    title: note.codeTitle || "",
    description: note.codeDescription || "",
    code: note.codeSnippet || "",
  }];
}

function createEmptySnippet() {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    code: "",
  };
}

function getCleanSnippets(snippets) {
  return (snippets || [])
    .map(normalizeSnippet)
    .filter((snippet) => snippet.title.trim() || snippet.description.trim() || snippet.code.trim());
}

function structuredCloneNote(note) {
  return {
    ...note,
    snippets: (note.snippets || []).map((snippet) => ({ ...snippet })),
  };
}

function getDefaultThemeSettings() {
  return {
    color: "#140c09",
    surfaceColor: "#21140f",
    overlayStrength: 0.55,
    noteOpacity: 0.42,
    editorOpacity: 0.72,
    imageData: "",
    imageName: "",
  };
}

function normalizeThemeSettings(value) {
  const defaults = getDefaultThemeSettings();
  return {
    color: typeof value?.color === "string" ? value.color : defaults.color,
    surfaceColor: typeof value?.surfaceColor === "string" ? value.surfaceColor : defaults.surfaceColor,
    overlayStrength: typeof value?.overlayStrength === "number" ? clamp(value.overlayStrength, 0, 1) : defaults.overlayStrength,
    noteOpacity: typeof value?.noteOpacity === "number" ? clamp(value.noteOpacity, 0, 1) : defaults.noteOpacity,
    editorOpacity: typeof value?.editorOpacity === "number" ? clamp(value.editorOpacity, 0, 1) : defaults.editorOpacity,
    imageData: typeof value?.imageData === "string" ? value.imageData : defaults.imageData,
    imageName: typeof value?.imageName === "string" ? value.imageName : defaults.imageName,
  };
}

function hexToRgb(value) {
  const hex = value.replace("#", "");
  const normalized = hex.length === 3
    ? hex.split("").map((char) => char + char).join("")
    : hex;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
