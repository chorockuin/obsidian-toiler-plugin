import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
// nvm install xlsx
import * as XLSX from 'xlsx';
// npm install --save-dev @types/js-yaml
import * as YAML from 'js-yaml';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

        this.addRibbonIcon('document', 'Toil', async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
				const input_files = (e.target as HTMLInputElement).files;
				if (input_files && input_files.length > 0) {
					const input_file = input_files[0];
					await this.toil_excel_file(input_file);
				} else {
					console.warn("no files selected");
				}
            };
            input.click();
        });
		
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// note: TFile -> md file
	// content: string -> whole string content from md file
	// frontmatter: string -> yaml string from the content
	// body: string -> string excluding the frontmatter from the content
    async toil_excel_file(excel_file: File) {
		try {
			const reader = new FileReader()
			reader.onload = async (e) => {
				const data = new Uint8Array((e.target as FileReader).result as ArrayBuffer)
				const workbook = XLSX.read(data, {type: 'array'});
				const worksheet = workbook.Sheets[workbook.SheetNames[0]];
				const json_table = XLSX.utils.sheet_to_json(worksheet);
				for (let data of json_table) {
					await this.process_data(data)
					break
				}
			}
			reader.readAsArrayBuffer(excel_file)
		} catch (e) {
			console.error(e.message)
			throw e
		}
    }

	async process_data(data: any) {
		const note_path = data["Name"] + ".md"
		const note = await this.create_note_from_template("templates/book.md", note_path)
		const content = await this.read_content_from_note(note)
		const frontmatter = this.read_frontmatter_from_content(content)
		
		frontmatter.title = data["Name"]
		frontmatter.created = "2023-10-05 16:18"
		const genre_map: { [key: string]: string } = {
			"Algorithm": "알고리즘",
			"Data Engineering": "데이터",
			"Engineering": "엔지니어링",
			"Essay": "에세이",
			"Hardware": "하드웨어",
			"Infrastructure": "인프라",
			"Language": "언어",
			"Math": "수학",
			"Network": "네트워크",
			"Quantum": "양자",
			"Robotics": "로보틱스",
			"Security": "보안",
			"System": "시스템"
		}
		frontmatter.genre = [genre_map[data["Type"]] || data["Type"]]
		frontmatter.release = parseInt(data["Year"])
		frontmatter.authors = data["Author"].split(", ").map((s: string) => s.trim());
		frontmatter.publishers = [data["Publisher"]]
		frontmatter.rating = ""
		frontmatter.status = "todo"

		const body = data["Link"]
		
		this.update_note_from_content(note, this.update_content_from_body(this.update_content_from_frontmatter(content, frontmatter), body))
	}

	async create_note_from_template(template_path: string, note_path: string) {
		try {
			const template = this.app.vault.getAbstractFileByPath(template_path);
			if (!(template instanceof TFile)) {
				throw new Error("template is not TFile format")
			}	

			const template_contents = await this.app.vault.read(template)
			
			await this.app.vault.create(note_path, template_contents)
			const note = this.app.vault.getAbstractFileByPath(note_path)
			if (!(note instanceof TFile)) {
				throw new Error("note is not TFile format")
			}
			return note
		} catch (e) {
			console.error(e.message)
			throw e
		}
	}

	async read_content_from_note(note: TFile) {	
		try {
			const content = await this.app.vault.read(note)
			return content
		} catch (e) {
			console.error(e.message)
			throw e
		}
	}

	async update_note_from_content(note: TFile, content: string) {
		try {
			await this.app.vault.modify(note, content)
		} catch (e) {
			console.error(e.message)
			throw e
		}
	}

	read_frontmatter_from_content(content: string) {
		try {
			const match = content.match(/---\n([\s\S]+?)\n---/)
			if (!match) {
				throw new Error("no yaml frontmatter found.")
			}
			const frontmatter = YAML.load(match[1]) as Record<string, any>
			return frontmatter
		} catch (e) {
			console.error(e.message)
			throw e
		}
	}

	update_content_from_frontmatter(content: string, frontmatter: Record<string, any>) {
		try {
			const updated_frontmatter = YAML.dump(frontmatter);
			const match = content.match(/---\n([\s\S]+?)\n---/)
			if (!match) {
				throw new Error("no yaml frontmatter found.")
			}
			const updated_content = content.replace(match[0], `---\n${updated_frontmatter}---`)
			return updated_content
		} catch (e) {
			console.error(e.message)
			throw e
		}
	}

	update_content_from_body(content: string, body: string) {
		const updated_content = content + "\n" + body
		return updated_content
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
