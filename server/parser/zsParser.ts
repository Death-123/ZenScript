// This parser follows https://github.com/CraftTweaker/ZenScript/tree/1f3f16efb9abe93a36bb4b7c11d10c27b67fca6f

import { IToken, Parser } from 'chevrotain';
import {
  AND,
  AND2,
  AND_ASSIGN,
  ANY,
  AS,
  ASSIGN,
  A_CLOSE,
  A_OPEN,
  BOOL,
  BREAK,
  BR_CLOSE,
  BR_OPEN,
  BYTE,
  COLON,
  COMMA,
  DIV,
  DIV_ASSIGN,
  DOLLAR,
  DOT,
  DOT2,
  DOUBLE,
  ELSE,
  EQ,
  FALSE,
  FLOAT,
  FLOAT_VALUE,
  FOR,
  FUNCTION,
  GLOBAL_ZS,
  GT,
  GTEQ,
  IDENTIFIER,
  IF,
  IMPORT,
  IN,
  INSTANCEOF,
  INT,
  INT_VALUE,
  LONG,
  LT,
  LTEQ,
  MINUS,
  MINUS_ASSIGN,
  MOD,
  MOD_ASSIGN,
  MUL,
  MUL_ASSIGN,
  NOT,
  NOT_EQ,
  NULL,
  OR,
  OR2,
  OR_ASSIGN,
  PLUS,
  PLUS_ASSIGN,
  QUEST,
  RETURN,
  SEMICOLON,
  SHORT,
  SQBR_CLOSE,
  SQBR_OPEN,
  STATIC,
  STRING,
  STRING_VALUE,
  TILDE,
  TILDE_ASSIGN,
  TRUE,
  VAL,
  VAR,
  VERSION,
  VOID,
  WHILE,
  XOR,
  XOR_ASSIGN,
  ZEN_CLASS,
  ZEN_CONSTRUCTOR,
  zsAllTokens,
} from './zsLexer';

export class ZenScriptParser extends Parser {
  constructor() {
    super(zsAllTokens, {
      maxLookahead: 2,
      recoveryEnabled: true,
    });
    this.performSelfAnalysis();
  }

  parse(input: IToken[]) {
    this.input = input;
    return this.Program();
  }

  /**
   * Level 1: Program
   * =================================================================================================
   */
  protected Program = this.RULE('Program', () => {
    this.MANY(() => {
      this.SUBRULE(this.ImportStatement);
    });

    this.MANY2(() =>
      this.OR([
        { ALT: () => this.SUBRULE(this.GlobalStaticDeclaration) },
        { ALT: () => this.SUBRULE(this.FunctionDeclaration) },
        { ALT: () => this.SUBRULE(this.ZenClassDeclaration) },
        { ALT: () => this.SUBRULE(this.Statement) },
      ])
    );
  });

  /**
   * Level 2
   * =================================================================================================
   */

  protected ImportStatement = this.RULE('ImportStatement', () => {
    this.CONSUME(IMPORT);
    this.SUBRULE(this.Package);
    this.OPTION(() => {
      this.CONSUME(AS);
      this.CONSUME(IDENTIFIER, { LABEL: 'alias' });
    });
    this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
  });

  /**
   * Global / Static
   */
  protected GlobalStaticDeclaration = this.RULE(
    'GlobalStaticDeclaration',
    () => {
      this.OR([
        { ALT: () => this.CONSUME(GLOBAL_ZS) },
        { ALT: () => this.CONSUME(STATIC) },
      ]);
      this.CONSUME(IDENTIFIER, {
        LABEL: 'vName',
        ERR_MSG: 'Identifier expected.',
      });
      this.OPTION(() => {
        this.SUBRULE(this.TypeDeclare, { LABEL: 'vType' });
      });
      this.CONSUME(ASSIGN, {
        ERR_MSG: 'Global and Static variables must be initialized.',
      });
      this.SUBRULE(this.Expression, { LABEL: 'value' });
      this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
    }
  );

  /**
   * Function declaration
   */
  protected FunctionDeclaration = this.RULE('FunctionDeclaration', () => {
    this.CONSUME(FUNCTION);
    this.CONSUME(IDENTIFIER, {
      LABEL: 'FunctionName',
      ERR_MSG: 'Identifier Expected.',
    });
    this.CONSUME(BR_OPEN, { ERR_MSG: `Missing '('` });
    this.OPTION(() => {
      this.SUBRULE(this.ParameterList);
    });
    this.CONSUME(BR_CLOSE, { ERR_MSG: `Missing ')'` });
    this.OPTION2(() => {
      this.SUBRULE(this.TypeDeclare);
    });
    this.SUBRULE(this.StatementBody);
  });

  protected ZenClassDeclaration = this.RULE('ZenClassDeclaration', () => {
    this.CONSUME(ZEN_CLASS);
    this.CONSUME(IDENTIFIER, { ERR_MSG: 'ClassName required' });
    this.CONSUME(A_OPEN, { ERR_MSG: '{ expected' });
    // TODO: reuse code
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.OR2([
              { ALT: () => this.CONSUME(VAR) },
              { ALT: () => this.CONSUME(VAL) },
              { ALT: () => this.CONSUME(STATIC) },
            ]);
            this.CONSUME2(IDENTIFIER, {
              ERR_MSG: 'Identifier expected',
            });
            this.OPTION(() => {
              this.SUBRULE(this.TypeDeclare);
            });
            this.OPTION2(() => {
              this.CONSUME(ASSIGN, {
                ERR_MSG: 'Global and Static variables must be initialized.',
              });
              this.SUBRULE(this.Expression);
            });
            this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
          },
        },
        {
          ALT: () => {
            this.CONSUME(ZEN_CONSTRUCTOR);
            this.CONSUME(BR_OPEN, { ERR_MSG: `Missing '('` });
            this.OPTION3(() => {
              this.SUBRULE(this.ParameterList);
            });
            this.CONSUME(BR_CLOSE, { ERR_MSG: `Missing ')'` });
            this.OPTION4(() => {
              this.SUBRULE2(this.TypeDeclare);
            });
            this.SUBRULE(this.StatementBody);
          },
        },
        {
          ALT: () => {
            this.SUBRULE(this.FunctionDeclaration);
          },
        },
      ]);
    });
    this.CONSUME(A_CLOSE, { ERR_MSG: '} expected' });
  });

  /**
   * Statements (>=1)
   */
  protected BlockStatement = this.RULE('BlockStatement', () => {
    this.AT_LEAST_ONE(() => {
      this.SUBRULE(this.Statement);
    });
  });

  /**
   * Level 3
   * =================================================================================================
   */

  /**
   * Multiple statements with {}
   */
  protected StatementBody = this.RULE('StatementBody', () => {
    this.CONSUME(A_OPEN);
    this.OPTION(() => {
      this.SUBRULE(this.BlockStatement);
    });
    this.CONSUME(A_CLOSE);
  });

  /**
   * Single statement
   */
  protected Statement = this.RULE('Statement', () => {
    this.OR([
      {
        GATE: () => this.LA(1).tokenType === A_OPEN,
        ALT: () => this.SUBRULE(this.StatementBody),
      },
      {
        // GATE: this.LA(1).tokenType === RETURN,
        ALT: () => this.SUBRULE(this.ReturnStatement),
      },
      {
        GATE: () =>
          this.LA(1).tokenType === VAL || this.LA(1).tokenType === VAR,
        ALT: () => this.SUBRULE(this.DeclareStatement),
      },
      { ALT: () => this.SUBRULE(this.IfStatement) },
      { ALT: () => this.SUBRULE(this.ForStatement) },
      { ALT: () => this.SUBRULE(this.WhileStatement) },
      { ALT: () => this.SUBRULE(this.VersionStatement) },
      { ALT: () => this.SUBRULE(this.BreakStatement) },
      { ALT: () => this.SUBRULE(this.ExpressionStatement) },
    ]);
  });

  /**
   * Level 4: Statements
   * =================================================================================================
   */
  protected ReturnStatement = this.RULE('ReturnStatement', () => {
    this.CONSUME(RETURN);
    this.OPTION(() => {
      this.SUBRULE(this.Expression);
    });
    this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
  });

  protected DeclareStatement = this.RULE('DeclareStatement', () => {
    this.OR([
      { ALT: () => this.CONSUME(VAR) }, // let
      { ALT: () => this.CONSUME(VAL) }, // const
    ]);

    this.CONSUME(IDENTIFIER, {
      ERR_MSG: 'Identifier expected.',
    });
    this.OPTION(() => {
      this.SUBRULE(this.TypeDeclare);
    });
    this.OPTION2(() => {
      this.CONSUME(ASSIGN);
      this.SUBRULE(this.Expression);
    });
    this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
  });

  protected IfStatement = this.RULE('IfStatement', () => {
    this.CONSUME(IF);
    this.CONSUME(BR_OPEN);
    this.SUBRULE(this.AssignExpression);
    this.CONSUME(BR_CLOSE);
    this.SUBRULE(this.Statement);
    this.OPTION(() => {
      this.CONSUME(ELSE);
      this.SUBRULE2(this.Statement);
    });
  });

  protected ForStatement = this.RULE('ForStatement', () => {
    this.CONSUME(FOR);
    this.AT_LEAST_ONE_SEP({
      SEP: COMMA,
      DEF: () => {
        this.CONSUME(IDENTIFIER, {
          ERR_MSG: 'Identifier expected',
        });
      },
    });
    this.CONSUME(IN);
    this.SUBRULE(this.Expression);
    this.SUBRULE(this.Statement);
  });

  protected WhileStatement = this.RULE('WhileStatement', () => {
    this.CONSUME(WHILE);
    this.SUBRULE(this.Expression);
    this.SUBRULE(this.Statement);
  });

  protected VersionStatement = this.RULE('VersionStatement', () => {
    this.CONSUME(VERSION);
    this.CONSUME(INT_VALUE, { ERR_MSG: 'INT_VALUE expected' });
    this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
  });

  protected BreakStatement = this.RULE('BreakStatement', () => {
    this.CONSUME(BREAK);
    this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
  });

  protected ExpressionStatement = this.RULE('ExpressionStatement', () => {
    this.SUBRULE(this.Expression);
    this.CONSUME(SEMICOLON, { ERR_MSG: '; expected' });
  });

  /**
   * Level 5: Expressions
   * =================================================================================================
   */
  protected Expression = this.RULE('Expression', () => {
    this.SUBRULE(this.AssignExpression);
  });

  protected AssignExpression = this.RULE('AssignExpression', () => {
    this.SUBRULE(this.ConditionalExpression);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(ASSIGN) },
        { ALT: () => this.CONSUME(PLUS_ASSIGN) },
        { ALT: () => this.CONSUME(MINUS_ASSIGN) },
        { ALT: () => this.CONSUME(TILDE_ASSIGN) },
        { ALT: () => this.CONSUME(MUL_ASSIGN) },
        { ALT: () => this.CONSUME(DIV_ASSIGN) },
        { ALT: () => this.CONSUME(MOD_ASSIGN) },
        { ALT: () => this.CONSUME(OR_ASSIGN) },
        { ALT: () => this.CONSUME(AND_ASSIGN) },
        { ALT: () => this.CONSUME(XOR_ASSIGN) },
      ]);
      this.SUBRULE(this.AssignExpression);
    });
  });

  protected UnaryExpression = this.RULE('UnaryExpression', () => {
    this.OR([
      {
        ALT: () => {
          this.OR2([
            { ALT: () => this.CONSUME(NOT) },
            { ALT: () => this.CONSUME(MINUS) },
          ]);
          this.SUBRULE(this.UnaryExpression);
        },
      },
      {
        ALT: () => {
          this.SUBRULE(this.PostfixExpression);
        },
      },
    ]);
  });

  protected AddExpression = this.RULE('AddExpression', () => {
    this.SUBRULE(this.MultiplyExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(PLUS) },
        { ALT: () => this.CONSUME(MINUS) },
        { ALT: () => this.CONSUME(TILDE) },
      ]);
      this.SUBRULE2(this.MultiplyExpression);
    });
  });

  protected MultiplyExpression = this.RULE('MultiplyExpression', () => {
    this.SUBRULE(this.UnaryExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(MUL) },
        { ALT: () => this.CONSUME(DIV) },
        { ALT: () => this.CONSUME(MOD) },
      ]);
      this.SUBRULE2(this.UnaryExpression);
    });
  });

  protected CompareExpression = this.RULE('CompareExpression', () => {
    this.SUBRULE(this.AddExpression);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(EQ) },
        { ALT: () => this.CONSUME(NOT_EQ) },
        { ALT: () => this.CONSUME(LT) },
        { ALT: () => this.CONSUME(LTEQ) },
        { ALT: () => this.CONSUME(GT) },
        { ALT: () => this.CONSUME(GTEQ) },
        { ALT: () => this.CONSUME(IN) },
      ]);
      this.SUBRULE2(this.AddExpression);
    });
  });

  protected AndExpression = this.RULE('AndExpression', () => {
    this.SUBRULE(this.CompareExpression);
    this.MANY(() => {
      this.CONSUME(AND);
      this.SUBRULE2(this.CompareExpression);
    });
  });

  protected AndAndExpression = this.RULE('AndAndExpression', () => {
    this.SUBRULE(this.OrExpression);
    this.MANY(() => {
      this.CONSUME(AND2);
      this.SUBRULE2(this.OrExpression);
    });
  });

  protected OrExpression = this.RULE('OrExpression', () => {
    this.SUBRULE(this.XorExpression);
    this.MANY(() => {
      this.CONSUME(OR);
      this.SUBRULE2(this.XorExpression);
    });
  });

  protected OrOrExpression = this.RULE('OrOrExpression', () => {
    this.SUBRULE(this.AndAndExpression);
    this.MANY(() => {
      this.CONSUME(OR2);
      this.SUBRULE2(this.AndAndExpression);
    });
  });

  protected XorExpression = this.RULE('XorExpression', () => {
    this.SUBRULE(this.AndExpression);
    this.MANY(() => {
      this.CONSUME(XOR);
      this.SUBRULE2(this.AndExpression);
    });
  });

  protected ConditionalExpression = this.RULE('ConditionalExpression', () => {
    this.SUBRULE(this.OrOrExpression);
    this.OPTION(() => {
      this.CONSUME(QUEST);
      this.SUBRULE2(this.OrOrExpression);
      this.CONSUME(COLON, { ERR_MSG: ': expected' });
      this.SUBRULE(this.ConditionalExpression);
    });
  });

  protected PostfixExpression = this.RULE('PostfixExpression', () => {
    this.SUBRULE(this.PrimaryExpression);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(DOT);
            this.OR2([
              { ALT: () => this.CONSUME(IDENTIFIER) },
              { ALT: () => this.CONSUME(VERSION) },
              { ALT: () => this.CONSUME(STRING) },
            ]);
          },
        },
        {
          GATE: () =>
            this.LA(1).tokenType === IDENTIFIER && this.LA(1).image === 'to',
          ALT: () => {
            this.CONSUME2(IDENTIFIER);
            this.SUBRULE(this.AssignExpression);
          },
        },
        {
          ALT: () => {
            this.CONSUME(DOT2);
            this.SUBRULE2(this.AssignExpression);
          },
        },
        {
          ALT: () => {
            this.CONSUME(SQBR_OPEN);
            this.SUBRULE3(this.AssignExpression, { LABEL: 'INDEX' });
            this.CONSUME(SQBR_CLOSE);
            this.OPTION(() => {
              this.CONSUME(ASSIGN);
              this.SUBRULE4(this.AssignExpression);
            });
          },
        },
        {
          ALT: () => {
            this.CONSUME(BR_OPEN);
            this.MANY_SEP({
              SEP: COMMA,
              DEF: () => {
                this.SUBRULE5(this.AssignExpression);
              },
            });
            this.CONSUME(BR_CLOSE);
          },
        },
        {
          ALT: () => {
            this.SUBRULE(this.TypeDeclare);
          },
        },
        {
          ALT: () => {
            this.CONSUME(INSTANCEOF);
            this.SUBRULE(this.TypeAnnotation);
          },
        },
      ]);
    });
  });

  protected PrimaryExpression = this.RULE('PrimaryExpression', () => {
    this.OR([
      { ALT: () => this.CONSUME(INT_VALUE) },
      { ALT: () => this.CONSUME(FLOAT_VALUE) },
      { ALT: () => this.CONSUME(STRING_VALUE) },
      { ALT: () => this.CONSUME(IDENTIFIER) },
      {
        ALT: () => this.SUBRULE(this.LambdaFunctionDeclaration),
      },
      { ALT: () => this.SUBRULE(this.BracketHandler) },
      { ALT: () => this.SUBRULE(this.ZSArray) },
      { ALT: () => this.SUBRULE(this.ZSMap) },
      { ALT: () => this.CONSUME(TRUE) },
      { ALT: () => this.CONSUME(FALSE) },
      { ALT: () => this.CONSUME(NULL) },
      {
        ALT: () => {
          this.CONSUME(BR_OPEN);
          this.SUBRULE(this.AssignExpression);
          this.CONSUME(BR_CLOSE);
        },
      },
    ]);
  });

  /**
   * Level 6 Others
   * =================================================================================================
   */
  protected LambdaFunctionDeclaration = this.RULE(
    'LambdaFunctionDeclaration',
    () => {
      this.CONSUME(FUNCTION);
      this.CONSUME(BR_OPEN);
      this.OPTION(() => {
        this.SUBRULE(this.ParameterList);
      });
      this.CONSUME(BR_CLOSE);
      this.OPTION2(() => {
        this.SUBRULE(this.TypeDeclare);
      });
      this.SUBRULE(this.StatementBody);
    }
  );

  protected BracketHandler = this.RULE('BracketHandler', () => {
    this.CONSUME(LT);
    this.AT_LEAST_ONE_SEP({
      SEP: COLON,
      DEF: () => {
        this.AT_LEAST_ONE({
          NAME: '$BracketHandlerItemGroup',
          DEF: () => {
            this.OR({
              NAME: '$BracketHandlerItem',
              DEF: [
                { ALT: () => this.CONSUME(IDENTIFIER) },
                { ALT: () => this.CONSUME(FLOAT_VALUE) },
                { ALT: () => this.CONSUME(INT_VALUE) },
                { ALT: () => this.CONSUME(STRING_VALUE) },

                { ALT: () => this.CONSUME(ANY) },
                { ALT: () => this.CONSUME(BOOL) },
                { ALT: () => this.CONSUME(BYTE) },
                { ALT: () => this.CONSUME(SHORT) },
                { ALT: () => this.CONSUME(INT) },
                { ALT: () => this.CONSUME(LONG) },
                { ALT: () => this.CONSUME(FLOAT) },
                { ALT: () => this.CONSUME(DOUBLE) },
                { ALT: () => this.CONSUME(STRING) },
                { ALT: () => this.CONSUME(FUNCTION) },
                { ALT: () => this.CONSUME(IN) },
                { ALT: () => this.CONSUME(VOID) },
                { ALT: () => this.CONSUME(AS) },
                { ALT: () => this.CONSUME(VERSION) },
                { ALT: () => this.CONSUME(IF) },
                { ALT: () => this.CONSUME(ELSE) },
                { ALT: () => this.CONSUME(FOR) },
                { ALT: () => this.CONSUME(RETURN) },
                { ALT: () => this.CONSUME(VAR) },
                { ALT: () => this.CONSUME(VAL) },
                { ALT: () => this.CONSUME(GLOBAL_ZS) },
                { ALT: () => this.CONSUME(STATIC) },
                { ALT: () => this.CONSUME(INSTANCEOF) },
                { ALT: () => this.CONSUME(WHILE) },
                { ALT: () => this.CONSUME(BREAK) },
                { ALT: () => this.CONSUME(NULL) },
                { ALT: () => this.CONSUME(TRUE) },
                { ALT: () => this.CONSUME(FALSE) },
                { ALT: () => this.CONSUME(IMPORT) },
                { ALT: () => this.CONSUME(ZEN_CLASS) },
                { ALT: () => this.CONSUME(ZEN_CONSTRUCTOR) },

                { ALT: () => this.CONSUME(A_OPEN) },
                { ALT: () => this.CONSUME(A_CLOSE) },
                { ALT: () => this.CONSUME(SQBR_OPEN) },
                { ALT: () => this.CONSUME(SQBR_CLOSE) },
                { ALT: () => this.CONSUME(DOT2) },
                { ALT: () => this.CONSUME(DOT) },
                { ALT: () => this.CONSUME(COMMA) },
                { ALT: () => this.CONSUME(PLUS_ASSIGN) },
                { ALT: () => this.CONSUME(PLUS) },
                { ALT: () => this.CONSUME(MINUS_ASSIGN) },
                { ALT: () => this.CONSUME(MINUS) },
                { ALT: () => this.CONSUME(MUL_ASSIGN) },
                { ALT: () => this.CONSUME(MUL) },
                { ALT: () => this.CONSUME(DIV_ASSIGN) },
                { ALT: () => this.CONSUME(DIV) }, // #7
                { ALT: () => this.CONSUME(MOD_ASSIGN) },
                { ALT: () => this.CONSUME(MOD) },
                { ALT: () => this.CONSUME(OR_ASSIGN) },
                { ALT: () => this.CONSUME(OR2) },
                { ALT: () => this.CONSUME(OR) },
                { ALT: () => this.CONSUME(AND_ASSIGN) },
                { ALT: () => this.CONSUME(AND2) },
                { ALT: () => this.CONSUME(AND) },
                { ALT: () => this.CONSUME(XOR_ASSIGN) },
                { ALT: () => this.CONSUME(XOR) },
                { ALT: () => this.CONSUME(QUEST) },
                { ALT: () => this.CONSUME(COLON) },
                { ALT: () => this.CONSUME(BR_OPEN) },
                { ALT: () => this.CONSUME(BR_CLOSE) },
                { ALT: () => this.CONSUME(TILDE_ASSIGN) },
                { ALT: () => this.CONSUME(TILDE) },
                { ALT: () => this.CONSUME(SEMICOLON) },
                { ALT: () => this.CONSUME(EQ) },
                { ALT: () => this.CONSUME(ASSIGN) },
                { ALT: () => this.CONSUME(NOT_EQ) },
                { ALT: () => this.CONSUME(NOT) },
                { ALT: () => this.CONSUME(DOLLAR) },
              ],
            });
          },
        });
      },
    });
    this.CONSUME(GT);
  });

  protected ZSArray = this.RULE('ZSArray', () => {
    this.CONSUME(SQBR_OPEN);
    this.OPTION(() => {
      this.SUBRULE(this.AssignExpression);
      this.MANY(() => {
        this.CONSUME(COMMA);
        this.SUBRULE2(this.AssignExpression);
      });
      this.OPTION2(() => {
        this.CONSUME2(COMMA);
      });
    });
    this.CONSUME(SQBR_CLOSE);
  });

  protected ZSMap = this.RULE('ZSMap', () => {
    this.CONSUME(A_OPEN);
    this.OPTION(() => {
      this.SUBRULE(this.ZSMapEntry);
      this.MANY(() => {
        this.CONSUME(COMMA);
        this.SUBRULE2(this.ZSMapEntry);
      });
      this.OPTION2(() => {
        this.CONSUME2(COMMA);
      });
    });
    this.CONSUME(A_CLOSE);
  });

  protected ZSMapEntry = this.RULE('ZSMapEntry', () => {
    this.SUBRULE(this.AssignExpression, { LABEL: 'KEY' });
    this.CONSUME(COLON);
    this.SUBRULE2(this.AssignExpression, { LABEL: 'VALUE' });
  });

  protected Package = this.RULE('Package', () => {
    this.AT_LEAST_ONE_SEP({
      SEP: DOT,
      DEF: () => {
        this.OR({
          DEF: [
            { ALT: () => this.CONSUME(IDENTIFIER) },

            { ALT: () => this.CONSUME(ANY) },
            { ALT: () => this.CONSUME(BOOL) },
            { ALT: () => this.CONSUME(BYTE) },
            { ALT: () => this.CONSUME(SHORT) },
            { ALT: () => this.CONSUME(INT) },
            { ALT: () => this.CONSUME(LONG) },
            { ALT: () => this.CONSUME(FLOAT) },
            { ALT: () => this.CONSUME(DOUBLE) },
            { ALT: () => this.CONSUME(STRING) },
            { ALT: () => this.CONSUME(FUNCTION) },
            { ALT: () => this.CONSUME(IN) },
            { ALT: () => this.CONSUME(VOID) },
            { ALT: () => this.CONSUME(AS) },
            { ALT: () => this.CONSUME(VERSION) },
            { ALT: () => this.CONSUME(IF) },
            { ALT: () => this.CONSUME(ELSE) },
            { ALT: () => this.CONSUME(FOR) },
            { ALT: () => this.CONSUME(RETURN) },
            { ALT: () => this.CONSUME(VAR) },
            { ALT: () => this.CONSUME(VAL) },
            { ALT: () => this.CONSUME(GLOBAL_ZS) },
            { ALT: () => this.CONSUME(STATIC) },
            { ALT: () => this.CONSUME(INSTANCEOF) },
            { ALT: () => this.CONSUME(WHILE) },
            { ALT: () => this.CONSUME(BREAK) },
            { ALT: () => this.CONSUME(NULL) },
            { ALT: () => this.CONSUME(TRUE) },
            { ALT: () => this.CONSUME(FALSE) },
            { ALT: () => this.CONSUME(IMPORT) },
            { ALT: () => this.CONSUME(ZEN_CLASS) },
            { ALT: () => this.CONSUME(ZEN_CONSTRUCTOR) },
          ],
        });
      },
    });
  });

  protected ParameterList = this.RULE('ParameterList', () => {
    this.AT_LEAST_ONE_SEP({
      SEP: COMMA,
      DEF: () => this.SUBRULE(this.Parameter),
    });
  });

  protected Parameter = this.RULE('Parameter', () => {
    this.CONSUME(IDENTIFIER);
    this.OPTION(() => {
      this.SUBRULE(this.TypeDeclare);
    });
  });

  protected TypeDeclare = this.RULE('TypeDeclare', () => {
    this.CONSUME(AS);
    this.SUBRULE(this.TypeAnnotation);
  });

  protected TypeAnnotation = this.RULE('TypeAnnotation', () => {
    this.OR({
      DEF: [
        { ALT: () => this.CONSUME(ANY) },
        { ALT: () => this.CONSUME(VOID) },
        { ALT: () => this.CONSUME(BOOL) },
        { ALT: () => this.CONSUME(BYTE) },
        { ALT: () => this.CONSUME(SHORT) },
        { ALT: () => this.CONSUME(INT) },
        { ALT: () => this.CONSUME(LONG) },
        { ALT: () => this.CONSUME(FLOAT) },
        { ALT: () => this.CONSUME(DOUBLE) },
        { ALT: () => this.CONSUME(STRING) },
        {
          ALT: () => {
            this.AT_LEAST_ONE_SEP({
              SEP: DOT,
              DEF: () => {
                this.CONSUME(IDENTIFIER);
              },
            });
          },
        },
        {
          ALT: () => {
            this.CONSUME(FUNCTION);
            this.CONSUME(BR_OPEN);
            this.MANY_SEP({
              SEP: COMMA,
              DEF: () => {
                this.SUBRULE(this.TypeAnnotation, {
                  LABEL: 'ParameterType',
                });
              },
            });
            this.CONSUME(BR_CLOSE);
            this.SUBRULE2(this.TypeAnnotation, {
              LABEL: 'FunctionType',
            });
          },
        },
        {
          ALT: () => {
            this.CONSUME(SQBR_OPEN);
            this.SUBRULE3(this.TypeAnnotation, {
              LABEL: 'ArrayType',
            });
            this.CONSUME(SQBR_CLOSE);
          },
        },
      ],
      ERR_MSG: 'Must be a type.',
    });
    this.MANY(() => {
      this.CONSUME2(SQBR_OPEN);
      this.OPTION(() => {
        this.SUBRULE4(this.TypeAnnotation, {
          LABEL: 'ZenTypeAssociative',
        });
      });
      this.CONSUME2(SQBR_CLOSE);
    });
  });
}

export const ZSParser = new ZenScriptParser();
