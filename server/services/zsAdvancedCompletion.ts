import {
  CompletionItem,
  CompletionParams,
  InitializeResult,
} from 'vscode-languageserver';
import { zGlobal } from '../api/global';
import {
  BracketHandlerMap,
  BracketHandlers,
  DetailBracketHandlers,
  SimpleBracketHandlers,
} from '../completion/bracketHandler/bracketHandlers';
import { ItemBracketHandler } from '../completion/bracketHandler/item';
import { GlobalCompletion } from '../completion/global';
import { ImportCompletion } from '../completion/import';
import { PreProcessorCompletions } from '../completion/preprocessor/preprocessors';
import { DOT, IMPORT } from '../parser/zsLexer';
import { findToken } from '../utils/findToken';
import { getdocumentSettings } from '../utils/setting';
import { ClientInfo, ZenScriptService } from './zsService';

export class ZenScriptAdvancedCompletion implements ZenScriptService {
  test(client: ClientInfo): boolean {
    return (
      client.isFolder &&
      !!client.capability.textDocument &&
      !!client.capability.textDocument.completion &&
      !!client.capability.textDocument.completion.completionItem
    );
  }
  apply(service: InitializeResult): void {
    if (!service.capabilities.completionProvider) {
      service.capabilities.completionProvider = {
        resolveProvider: true,
        triggerCharacters: [],
      };
    }
    // #preprocessor
    service.capabilities.completionProvider.triggerCharacters.push(
      '#',
      '.',
      ':',
      '<',
      ' '
    );
    zGlobal.conn.onCompletion(ZenScriptAdvancedCompletion.doCompletion);
    zGlobal.conn.onCompletionResolve(
      ZenScriptAdvancedCompletion.doCompletionResolve
    );
  }

  static async doCompletion(
    completion: CompletionParams
  ): Promise<CompletionItem[]> {
    await zGlobal.bus.wait('all-zs-parsed');

    // 获得当前正在修改的 document
    const document = zGlobal.documents.get(completion.textDocument.uri);
    // 当前补全的位置
    const position = completion.position;
    // 当前补全的 offset
    let offset = document.offsetAt(position);
    // Tokens
    const tokens = zGlobal.zsFiles.get(document.uri).tokens;

    const now = document.positionAt(offset - 1);
    const first = { line: now.line, character: 0 };
    const line = document.getText({
      start: first,
      end: position,
    });

    let trigger = completion.context.triggerCharacter;
    const manuallyTriggerred = trigger === undefined;
    if (manuallyTriggerred) {
      let token = findToken(tokens, offset - 1);
      if (!token.exist) {
        const token = findToken(
          zGlobal.zsFiles.get(document.uri).comments,
          offset - 1
        );
        if (token.exist && token.found.token.image === '#') {
          trigger = token.found.token.image;
        }
      }
      if (!trigger) {
        if (line.match(/import [^\.]*$/)) {
          trigger = 'import';
        } else if (line.match(/<([^:<]+:)+[^:<]*(>?)/)) {
          trigger = ':';
        } else if (token.exist) {
          if (['#', '.', ':', '<'].includes(token.found.token.image)) {
            trigger = token.found.token.image;
          } else {
            const prev = findToken(tokens, token.found.token.startOffset - 1);
            if (
              prev.exist &&
              ['#', '.', ':', '<'].includes(prev.found.token.image)
            ) {
              trigger = prev.found.token.image;
              offset = token.found.token.startOffset;
            }
          }
        }
      }
    }

    // TODO: Finish AutoCompletion of `.`
    switch (trigger) {
      case '#':
        return PreProcessorCompletions;
      case 'import':
        return ImportCompletion([]);
      case ' ':
        // import<space>
        let s;
        do {
          offset--;
          s = document.getText({
            start: document.positionAt(offset),
            end: document.positionAt(offset + 1),
          });
        } while (s === ' ');
        let token = findToken(tokens, offset - 1);
        if (token.exist && token.found.token.image === 'import') {
          return ImportCompletion([]);
        }
        return [];
      case '.':
        // Find 'a.b.' when typing the last dot
        const now = findToken(tokens, offset - 1);
        if (!now.exist) {
          return [];
        }
        let pos,
          prev = [];
        for (
          pos = now.found.position;
          tokens[pos].tokenType === DOT;
          pos -= 2
        ) {
          prev.unshift(tokens[pos - 1].image);
        }
        if (tokens[pos].tokenType === IMPORT) {
          return ImportCompletion(prev);
        }
        break;
      case ':':
        // 位于 <> 内的内容
        let predecessor = line
          .substring(line.lastIndexOf('<') + 1, line.lastIndexOf(':'))
          .split(':');

        if (
          BracketHandlers.map((handler) => handler.name).indexOf(
            predecessor[0]
          ) === -1
        ) {
          predecessor = ['item', ...predecessor];
        }

        return BracketHandlerMap.get(predecessor[0])
          ? BracketHandlerMap.get(predecessor[0]).next(predecessor)
          : [];
      case '<':
        const setting = await getdocumentSettings(completion.textDocument.uri);
        return manuallyTriggerred || setting.autoshowLTCompletion
          ? setting.modIdItemCompletion
            ? [...SimpleBracketHandlers, ...ItemBracketHandler.next(['item'])]
            : [...SimpleBracketHandlers]
          : [];

      default:
        return [...GlobalCompletion()];
    }
  }

  static doCompletionResolve(item: CompletionItem): CompletionItem {
    if (item.data) {
      switch (item.data.triggerCharacter) {
        case '.':
          // TODO: Completion for `.`
          break;
        case ':':
          if (
            item.data.predecessor instanceof Array &&
            item.data.predecessor.length > 0
          ) {
            return BracketHandlerMap.get(item.data.predecessor[0]).detail(item);
          } else {
            return { label: '' };
          }
        case '<':
          const handler = DetailBracketHandlers.find(
            (i) => i.label === item.label
          );
          if (handler) {
            return handler;
          }
        // else here should return
        // and jumped to default
        // so `else return;` can be deleted
        default:
          return { label: '' };
      }
    }
  }
}
