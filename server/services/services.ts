import { ZenScriptAdvancedCompletion } from './zsAdvancedCompletion';
import { ZenScriptBasicCompletion } from './zsBasicCompletion';
import { ZenScriptDocumentConfigChange } from './zsDocumentConfigChange';
import { ZenScriptFormat } from './zsFormat';
import { ZenScriptGlobalConfigChange } from './zsGlobalConfigChange';
import { ZenScriptHover } from './zsHover';
import { ZenScriptInitialized } from './zsInitialized';
import { ZenScriptRCChange } from './zsRCChange';
import { ZenScriptInitializedService, ZenScriptService } from './zsService';
import { ZenScriptShutdown } from './zsShutdown';
import { ZenScriptSignatureHelp } from './zsSignatureHelp';
import { ZenScriptWorkspaceFolderChange } from './zsWorkspaceFolderChange';

export const ZenScriptServices: ZenScriptService[] = [
  new ZenScriptInitialized(),
  new ZenScriptShutdown(),
  new ZenScriptGlobalConfigChange(),
  new ZenScriptBasicCompletion(),
  new ZenScriptAdvancedCompletion(),
  new ZenScriptHover(),
  new ZenScriptFormat(),
  new ZenScriptRCChange(),
  new ZenScriptSignatureHelp(),
];

export const ZenScriptWorkspaceServices: ZenScriptInitializedService[] = [
  new ZenScriptDocumentConfigChange(),
  new ZenScriptWorkspaceFolderChange(),
];
