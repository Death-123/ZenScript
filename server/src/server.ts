import {
  createConnection,
  TextDocuments,
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Hover
} from "vscode-languageserver";
import { BrewingCompletionInstance } from "./completion/brewing";
import { textPositionToLocation } from "./utils/path";
import { ZSLexer } from "./parser/zsLexer";
import { IToken } from "chevrotain";

// 创建一个服务的连接，连接使用 Node 的 IPC 作为传输
// 并且引入所有 LSP 特性, 包括 preview / proposed
let connection = createConnection(ProposedFeatures.all);

// 创建一个简单的文本文档管理器，这个管理器仅仅支持同步所有文档
let documents: TextDocuments = new TextDocuments();

// 不支持配置
let hasConfigurationCapability: boolean = false;
// 不支持工作区目录
let hasWorkspaceFolderCapability: boolean = false;
//
let hasDiagnosticRelatedInformationCapability: boolean = false;

// Lex
let tokens: IToken[] = [];

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we will fall back using global settings
  hasConfigurationCapability =
    capabilities.workspace && !!capabilities.workspace.configuration;
  hasWorkspaceFolderCapability =
    capabilities.workspace && !!capabilities.workspace.workspaceFolders;
  hasDiagnosticRelatedInformationCapability =
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation;

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      // 告知客户端服务端支持代码补全
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: [".", ":"]
      },
      hoverProvider: true,
      // TODO: Support ZenScript Formatting
      documentFormattingProvider: false
    }
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

// The example settings
interface ZenScriptSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ZenScriptSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ZenScriptSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ZenScriptSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <ZenScriptSettings>(
      (change.settings.zenscript || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ZenScriptSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "zenscript"
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // In this simple example we get the settings for every validate run.
  let settings = await getDocumentSettings(textDocument.uri);

  // The validator creates diagnostics for all uppercase words length 2 and more
  let text = textDocument.getText();
  let pattern = /\b[A-Z]{2,}\b/g;
  let m: RegExpExecArray;

  tokens = ZSLexer.tokenize(text).tokens;

  let problems = 0;
  let diagnostics: Diagnostic[] = [];
  while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
    problems++;
    let diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: textDocument.positionAt(m.index),
        end: textDocument.positionAt(m.index + m[0].length)
      },
      message: `${m[0]} is all uppercase.`,
      source: "ex"
    };
    if (hasDiagnosticRelatedInformationCapability) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range)
          },
          message: "Spelling matters"
        },
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range)
          },
          message: "Particularly for names"
        }
      ];
    }
    diagnostics.push(diagnostic);
  }

  // Send the computed diagnostics to VS Code.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
  // 当 Watch 的文件确实发生变动
  connection.console.log("We received an file change event");
  connection.console.log(`${_change.changes[0].uri}`);
});

// 负责处理一级自动补全的条目
// This handler provides the initial list of the completion items.
connection.onCompletion(
  (position: TextDocumentPositionParams): CompletionItem[] => {
    // TODO: Add Intelligense, integrate with ZSlang
    const location = textPositionToLocation(position);
    console.log(documents.get(position.textDocument.uri).getText());
    return [BrewingCompletionInstance.base.simple];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
      return BrewingCompletionInstance.base.detail;
    }
  }
);

connection.onHover(textDocumentPositionParams => {
  const document = documents.get(textDocumentPositionParams.textDocument.uri);
  const position = textDocumentPositionParams.position;

  if (!document) {
    return Promise.resolve(void 0);
  }

  const offset = document.offsetAt(position);

  for (const token of tokens) {
    if (token.startOffset <= offset && token.endOffset >= offset) {
      return Promise.resolve({
        contents: {
          kind: "plaintext",
          value: token.tokenType.tokenName
        },
        range: {
          start: document.positionAt(token.startOffset),
          end: document.positionAt(token.endOffset + 1)
        }
      } as Hover);
    }
  }

  return Promise.resolve(void 0);
});

connection.onDidOpenTextDocument(params => {
  // A text document got opened in VS Code.
  // params.uri uniquely identifies the document. For documents store on disk this is a file URI.
  // params.text the initial full content of the document.
  connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument(params => {
  // The content of a text document did change in VS Code.
  // params.uri uniquely identifies the document.
  // params.contentChanges describe the content changes to the document.
  connection.console.log(
    `${params.textDocument.uri} changed: ${JSON.stringify(
      params.contentChanges
    )}`
  );
});
connection.onDidCloseTextDocument(params => {
  // A text document got closed in VS Code.
  // params.uri uniquely identifies the document.
  connection.console.log(`${params.textDocument.uri} closed.`);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
