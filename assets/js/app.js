const state = {
  role: null,
  instructions: [],
};

const APP_NAME = "Plumber";
const DEFAULT_PAGE_TITLE = "Plumber: Checking data leakage using LLM";

const dom = {
  pageTitleInput: document.getElementById("page-title-input"),
  methodInput: document.getElementById("method-input"),
  methodStats: document.getElementById("method-stats"),
  instructionStatus: document.getElementById("instruction-status"),
  instructionList: document.getElementById("instruction-list"),
  promptOutput: document.getElementById("prompt-output"),
  copyPrompt: document.getElementById("copy-prompt"),
  copyStatus: document.getElementById("copy-status"),
  selectAll: document.getElementById("select-all"),
  clearAll: document.getElementById("clear-all"),
  template: document.getElementById("instruction-template"),
};

function parseFrontMatter(markdown) {
  const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!frontMatterMatch) {
    return {
      metadata: {},
      content: markdown.trim(),
    };
  }

  const metadata = {};

  for (const line of frontMatterMatch[1].split("\n")) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    metadata[key] = coerceValue(rawValue);
  }

  return {
    metadata,
    content: markdown.slice(frontMatterMatch[0].length).trim(),
  };
}

function coerceValue(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value.replace(/^"(.*)"$/, "$1");
}

function syncTitleFieldHeight() {
  if (dom.pageTitleInput.tagName !== "TEXTAREA") {
    return;
  }

  dom.pageTitleInput.style.height = "auto";
  dom.pageTitleInput.style.height = `${dom.pageTitleInput.scrollHeight}px`;
}

async function loadPromptAssets() {
  const manifestResponse = await fetch("./instructions/manifest.json");

  if (!manifestResponse.ok) {
    throw new Error("Could not load instructions/manifest.json.");
  }

  const manifest = await manifestResponse.json();
  const roleFile = manifest.roleFile;
  const entries = Array.isArray(manifest.instructions) ? manifest.instructions : [];

  if (!roleFile) {
    throw new Error("Manifest is missing roleFile.");
  }

  const roleResponse = await fetch(`./instructions/${roleFile}`);

  if (!roleResponse.ok) {
    throw new Error(`Could not load role file: ${roleFile}`);
  }

  const roleMarkdown = await roleResponse.text();
  const parsedRole = parseFrontMatter(roleMarkdown);
  const role = {
    file: roleFile,
    title: parsedRole.metadata.title || "Reviewer role",
    summary:
      parsedRole.metadata.summary ||
      "Acts as a methods reviewer focused on leakage risk.",
    content: parsedRole.content,
  };

  const instructions = await Promise.all(
    entries.map(async (entry) => {
      const response = await fetch(`./instructions/${entry.file}`);

      if (!response.ok) {
        throw new Error(`Could not load instruction file: ${entry.file}`);
      }

      const markdown = await response.text();
      const parsed = parseFrontMatter(markdown);

      return {
        file: entry.file,
        id: parsed.metadata.id || entry.file.replace(/\.md$/i, ""),
        title: parsed.metadata.title || entry.file,
        summary: parsed.metadata.summary || "No summary provided.",
        defaultSelected:
          typeof parsed.metadata.defaultSelected === "boolean"
            ? parsed.metadata.defaultSelected
            : true,
        content: parsed.content,
      };
    })
  );

  return {
    role,
    instructions: instructions.sort((left, right) => left.priority - right.priority),
  };
}

function renderInstructions() {
  dom.instructionList.replaceChildren();

  for (const instruction of state.instructions) {
    const fragment = dom.template.content.cloneNode(true);
    const checkbox = fragment.querySelector(".instruction-checkbox");
    const title = fragment.querySelector(".instruction-title");

    checkbox.checked = instruction.defaultSelected;
    checkbox.dataset.instructionId = instruction.id;
    checkbox.addEventListener("change", updatePrompt);

    title.textContent = instruction.title;

    dom.instructionList.appendChild(fragment);
  }
}

function getSelectedInstructions() {
  const selectedIds = Array.from(
    dom.instructionList.querySelectorAll(".instruction-checkbox:checked"),
    (checkbox) => checkbox.dataset.instructionId
  );

  return state.instructions.filter((instruction) => selectedIds.includes(instruction.id));
}

function buildPrompt(pageTitle, methodText, selectedInstructions) {
  const titleBlock = pageTitle.trim() || DEFAULT_PAGE_TITLE;
  const methodBlock =
    methodText.trim() || "[Paste the method section here before using this prompt.]";
  const roleBlock = state.role
    ? `${state.role.title}\n${state.role.content}`
    : "You are reviewing a research methods section for possible information leakage.";
  const instructionBlock =
    selectedInstructions.length > 0
      ? selectedInstructions
          .map(
            (instruction, index) =>
              `${index + 1}. ${instruction.title}\nSummary: ${instruction.summary}\nDetails:\n${instruction.content}`
          )
          .join("\n\n")
      : "No checklist items were selected. Choose at least one leakage instruction before using this prompt.";

  return [
    roleBlock,
    "",
    "Prompt title:",
    titleBlock,
    "",
    "Goal:",
    "Evaluate whether the method section shows clear leakage, likely leakage, possible leakage, or insufficient reporting to rule leakage out.",
    "",
    "Method section to review:",
    "<<<METHOD_SECTION",
    methodBlock,
    "METHOD_SECTION",
    "",
    "Selected leakage-check instructions:",
    instructionBlock,
    "",
    "Review rules:",
    "- Base the assessment only on the text provided.",
    "- Do not assume best practice when the section is vague or silent.",
    "- Separate confirmed leakage from uncertainty or missing information.",
    "- Quote the relevant wording from the method section whenever you flag a concern.",
    "- If the text appears safe, still note what details would be needed to confirm that judgment.",
    "",
    "Return your answer with the following sections:",
    "1. Overall verdict",
    "2. Item-by-item assessment for each selected instruction",
    "3. Missing details that prevent a confident assessment",
    "4. Suggested rewrite or clarifications for the method section",
    "5. Final author checklist",
  ].join("\n");
}

function updatePrompt() {
  const pageTitle = dom.pageTitleInput.value;
  const methodText = dom.methodInput.value;
  const selectedInstructions = getSelectedInstructions();
  const trimmedTitle = pageTitle.trim();
  syncTitleFieldHeight();
  dom.methodStats.textContent = `${methodText.length.toLocaleString()} characters`;
  dom.promptOutput.value = buildPrompt(pageTitle, methodText, selectedInstructions);
  document.title =
    trimmedTitle && trimmedTitle !== DEFAULT_PAGE_TITLE
      ? `${trimmedTitle} | ${APP_NAME}`
      : DEFAULT_PAGE_TITLE;

  const selectedNames = selectedInstructions.map((instruction) => instruction.title);
  dom.instructionStatus.textContent =
    selectedNames.length === 0
      ? "No instructions selected."
      : `Selected: ${selectedNames.join(", ")}`;
  dom.instructionStatus.className = "status";
}

async function copyPrompt() {
  try {
    await copyPromptText(dom.promptOutput.value);
    dom.copyStatus.textContent = "Prompt copied to clipboard.";
    dom.copyStatus.className = "status success";
  } catch (error) {
    dom.copyStatus.textContent =
      "Prompt selected. Press Cmd+C on Mac or Ctrl+C on Windows/Linux.";
    dom.copyStatus.className = "status";
    selectPromptOutput();
  }
}

async function copyPromptText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the selection-based fallback below.
    }
  }

  if (legacyCopyText(text)) {
    return;
  }

  throw new Error("Copy command failed.");
}

function legacyCopyText(text) {
  const tempTextarea = document.createElement("textarea");
  tempTextarea.value = text;
  tempTextarea.setAttribute("aria-hidden", "true");
  tempTextarea.style.position = "fixed";
  tempTextarea.style.top = "0";
  tempTextarea.style.left = "-9999px";
  tempTextarea.style.opacity = "0";

  document.body.appendChild(tempTextarea);
  tempTextarea.focus();
  tempTextarea.select();
  tempTextarea.setSelectionRange(0, tempTextarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(tempTextarea);
  }
}

function selectPromptOutput() {
  dom.promptOutput.focus();
  dom.promptOutput.select();
  dom.promptOutput.setSelectionRange(0, dom.promptOutput.value.length);
}

function setAllInstructions(checked) {
  const checkboxes = dom.instructionList.querySelectorAll(".instruction-checkbox");

  for (const checkbox of checkboxes) {
    checkbox.checked = checked;
  }

  updatePrompt();
}

async function init() {
  dom.pageTitleInput.addEventListener("input", updatePrompt);
  dom.methodInput.addEventListener("input", updatePrompt);
  dom.copyPrompt.addEventListener("click", copyPrompt);
  dom.selectAll.addEventListener("click", () => setAllInstructions(true));
  dom.clearAll.addEventListener("click", () => setAllInstructions(false));

  try {
    const loaded = await loadPromptAssets();
    state.role = loaded.role;
    state.instructions = loaded.instructions;
    renderInstructions();
    syncTitleFieldHeight();
    updatePrompt();
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unknown error while loading instructions.";
    console.error("Instruction loading failed.", error);
    dom.instructionStatus.textContent = `Instruction loading failed. ${detail}`;
    dom.instructionStatus.className = "status error";
    dom.promptOutput.value =
      "Instruction loading failed. Check instructions/manifest.json and confirm the instruction markdown files are published as static assets.";
  }
}

init();
