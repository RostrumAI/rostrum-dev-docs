import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const markdownFiles = [];

async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;

        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            await collect(path);
        } else if (extname(entry.name) === ".md") {
            markdownFiles.push(path);
        }
    }
}

await collect(root);

const failures = [];
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const file of markdownFiles) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(linkPattern)) {
        const href = match[1].trim();
        const pathPart = href.split("#", 1)[0];
        if (!pathPart || /^(?:[a-z]+:|\/\/)/i.test(pathPart)) continue;

        const target = resolve(dirname(file), decodeURIComponent(pathPart));
        try {
            await access(target);
        } catch {
            failures.push(`${file.slice(root.length + 1)} -> ${href}`);
        }
    }
}

if (failures.length > 0) {
    console.error(`Broken relative links:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
    process.exitCode = 1;
} else {
    console.log(`Checked relative links in ${markdownFiles.length} Markdown files.`);
}
