const cheerio = require("cheerio");
const cheerioGetUniqueSelector = require('cheerio-get-css-selector');
const helpers = require("./helpers");
const { SYMBOL, TYPE } = require("./config");
/**
 * scans the input and makes token from them;
 * @param {String} name 
 * @param {String} input 
 */
function blueprint(name, input) {
  const tokens = __tokenize(input);
  const formatedInput = __format(input, tokens);
  const treeRoot = __tree(tokens, formatedInput);
  console.log(tokens);
}

/**
 * scans for tokens;
 * @param {String} input 
 * @return {Array[__token]}
 */
function __tokenize(input) {
  const T_START = '{';
  const T_END = '}';

  const tokens = [new __token(":ROOT")];
  let pos = 0;
  while(true) {
    const tsPos = input.indexOf(T_START, pos);
    if (tsPos === -1) break;
    const tePos = input.indexOf(T_END, tsPos + T_START.length);
    if (tePos === -1) throw "end of token not found";

    const tString = input.substring(tsPos + T_START.length, tePos);
    const token = new __token(tString, tsPos, tePos);
    tokens.push(token);
    pos = tsPos + T_END.length;
  }

  return tokens;
}

/**
 * generates token from tokenString;
 * @param {String} tString 
 * @param {Number} tsPos 
 * @param {Number} tePos 
 */
function __token(tString, tsPos, tePos) {
  const TS_REGEX = /^(?<type>(\:\:)|(\:)|(\$))(?<name>[\.\w]+)?$/;
  const parsedTString = TS_REGEX.exec(tString);
  if (!parsedTString) return false;

  this.name = parsedTString.groups.name;
  this.type = parsedTString.groups.type + (this.name ? "" : ">");
  this.tsPos = tsPos;
  this.tePos = tePos;
  if (this.type === TYPE.LIST) {
    this.items = [];
  } else if (this.type === TYPE.DICT) {
    this.props = {};
  }

  if (
    this.type !== SYMBOL.DICT_END &&
    this.type !== SYMBOL.LIST_END
  ) {
    this.id = helpers.generateId();
  }
}

/**
 * makes a tree from tokens list;
 * @param {Array[__token]} tokens 
 * @param {String} formatedInput
 */
function __tree(tokens, formatedInput) {
  const $ = cheerio.load(formatedInput);
  cheerioGetUniqueSelector.init($);

  let treePath = [tokens[0]];
  let activeParent = tokens[0]
  let activeToken = tokens[1];

  for (i = 1; i < tokens.length; i++) {
    activeToken = tokens[i];
    if (!activeToken) break;

    if (
      activeToken.type === SYMBOL.LIST_END ||
      activeToken.type === SYMBOL.DICT_END
    ) {
      treePath.pop();
      if (!treePath.length) throw "no parent remained";
      activeParent = treePath[treePath.length - 1];
      continue;
    }

    if (activeParent.type === TYPE.DICT) {
      activeParent.props[activeToken.name] = activeToken;
    } else {
      activeParent.items.push(activeToken);
      // pathIndex[pathIndex.length - 1]++;
    }

    __attachSelector($, activeToken, activeParent)

    if (activeToken.type === TYPE.LIST) {
      activeParent = activeToken;
      treePath.push(activeToken);
      // pathIndex.push(0);
    } else if (activeToken.type === TYPE.DICT) {
      activeParent = activeToken;
      treePath.push(activeToken);
    }

  }

  return tokens[0];
} 

/**
 * replaces tStrings with real schemee html elements;
 * @param {String} input 
 * @param {Array[__token]} tokens 
 */
function __format(input, tokens){
  const parts = [];

  let prevTEPos = 0;
  // first element is ROOT;
  for(let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const htmlElement = tokenToHtmlElement(token);
    parts.push(input.substring(prevTEPos, token.tsPos));
    parts.push(htmlElement);
    prevTEPos = token.tePos + 1 //1 should be dynamic;
  }

  return parts.join("");
}

function tokenToHtmlElement(token) {
  let tagName;
  switch (token.type) {
    case SYMBOL.LIST_START:
      tagName = "schemeeList";
      break;
    case SYMBOL.LIST_END:
      tagName = "/schemeeList";
      break;
    case SYMBOL.DICT_START:
      tagName = "schemeeDict";
      break;
    case SYMBOL.DICT_END:
      tagName = "schemeeDict";
      break;
    case SYMBOL.VALUE:
      tagName = "schemeeValue";
      break;
  }

  return `<${tagName}${token.id ? ` class="${token.id}"` : ""}>` + (token.type === TYPE.VALUE ? `</${tagName}>`: "");
}

/**
 * adds selector field to deserved token;
 * @param {Array[__token]} tokens 
 * @param {String} input 
 */
function __attachSelector($, token, parentToken) {
  if (!token.id) return;
  const schemeeElm = $(`.${token.id}`);
  if (!schemeeElm) throw "token element not found";
  let elm;
  if (
    token.type === TYPE.DICT ||
    token.type === TYPE.LIST 
  ) {
    elm = schemeeElm.children().first();
  } else {
    elm = schemeeElm.parent();
  }

  const uniqueSelector = elm.getUniqueSelector();
  let selector = uniqueSelector.replace(/((schemeelist)|(schemeedict)|(schemeevalue)) > /, "");
  if (parentToken.selector) {
    const i = selector.lastIndexOf(parentToken.selector);
    selector = selector.substring(i + parentToken.selector.length + 3);
  }

  const path = selector.split(" > ").map(sign => {
    sign = sign.split(":");
    if (sign.length === 1) return {sign: sign[0]};
    let n;
    if (sign[1] === "first-child") n = 0;
    else if (sign[1] === "last-child") n = "last";
    else {
      const parsed = /nth\-child\((\d+)\)/.exec(sign[1]);
      n = +parsed[1] - 1;
    }

    return {sign: sign[0], i: n}
  });
  
  token.selector = selector;
  token.path = path;
}

function schemee() {
  this.blueprints = {};

  this.blueprint = blueprint;
}

module.exports = () => {
  return new schemee();
};