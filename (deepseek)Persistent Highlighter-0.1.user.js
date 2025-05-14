// ==UserScript==
// @name         Precise Persistent Highlighter
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Highlights text precisely by tracking exact text node positions
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const HIGHLIGHT_CLASS = 'persistent-highlight';
    let highlightColor = '#FFFF0055'; // Yellow with transparency

    // Main function to highlight the current selection
    function highlightSelection() {
        const selection = window.getSelection();
        if (selection.isCollapsed) return;

        const ranges = getTextNodeRanges(selection);
        if (ranges.length === 0) return;

        ranges.forEach(rangeInfo => {
            const { textNode, startOffset, endOffset } = rangeInfo;
            highlightTextRange(textNode, startOffset, endOffset);
        });

        saveHighlights();
        selection.removeAllRanges();
    }

    // Get all text node ranges in the selection
    function getTextNodeRanges(selection) {
        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        
        // Special case: selection is within a single text node
        if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
            return [{
                textNode: startContainer,
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                xpath: getXPath(startContainer.parentNode)
            }];
        }

        // Get all text nodes in the selected range
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            node => {
                // Check if node is within our range
                const startCompare = startContainer.compareDocumentPosition(node);
                const endCompare = endContainer.compareDocumentPosition(node);
                
                // Node is before our range
                if (startCompare & Node.DOCUMENT_POSITION_PRECEDING) return NodeFilter.FILTER_REJECT;
                // Node is after our range
                if (endCompare & Node.DOCUMENT_POSITION_FOLLOWING) return NodeFilter.FILTER_REJECT;
                
                return NodeFilter.FILTER_ACCEPT;
            }
        );

        const ranges = [];
        let currentNode;
        while (currentNode = walker.nextNode()) {
            const parentXPath = getXPath(currentNode.parentNode);
            let startOffset = 0;
            let endOffset = currentNode.length;

            // Adjust offsets for first and last nodes
            if (currentNode === startContainer) {
                startOffset = range.startOffset;
            }
            if (currentNode === endContainer) {
                endOffset = range.endOffset;
            }

            if (startOffset < endOffset) {
                ranges.push({
                    textNode: currentNode,
                    startOffset,
                    endOffset,
                    xpath: parentXPath
                });
            }
        }

        return ranges;
    }

    // Highlight a specific range within a text node
    function highlightTextRange(textNode, startOffset, endOffset) {
        const range = document.createRange();
        range.setStart(textNode, startOffset);
        range.setEnd(textNode, endOffset);

        const span = document.createElement('span');
        span.className = HIGHLIGHT_CLASS;
        span.style.backgroundColor = highlightColor;
        span.dataset.startOffset = startOffset;
        span.dataset.endOffset = endOffset;
        span.addEventListener('click', removeHighlight);

        try {
            range.surroundContents(span);
        } catch (e) {
            console.error('Could not highlight range:', e);
        }
    }

    // Save all highlights to localStorage
    function saveHighlights() {
        const highlights = [];
        
        document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(highlight => {
            const textNode = highlight.firstChild;
            if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
            
            highlights.push({
                xpath: getXPath(highlight.parentNode),
                text: textNode.textContent,
                startOffset: parseInt(highlight.dataset.startOffset),
                endOffset: parseInt(highlight.dataset.endOffset),
                color: highlight.style.backgroundColor
            });
        });

        localStorage.setItem(`highlights:${location.href}`, JSON.stringify(highlights));
    }

    // Load and restore highlights from localStorage
    function loadHighlights() {
        const saved = localStorage.getItem(`highlights:${location.href}`);
        if (!saved) return;
        
        const highlights = JSON.parse(saved);
        highlights.forEach(hl => {
            const parent = getElementByXPath(hl.xpath);
            if (!parent) return;
            
            // Find the text node that contains our text
            const textNode = findTextNodeByContent(parent, hl.text);
            if (!textNode) return;
            
            // Recreate the highlight
            highlightTextRange(textNode, hl.startOffset, hl.endOffset);
        });
    }

    // Find a text node containing specific text
    function findTextNodeByContent(parent, text) {
        const walker = document.createTreeWalker(
            parent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(text)) {
                return node;
            }
        }
        return null;
    }

    // Remove a highlight when clicked
    function removeHighlight(e) {
        const highlight = e.target;
        const textNode = document.createTextNode(highlight.textContent);
        highlight.replaceWith(textNode);
        saveHighlights();
    }

    // Generate XPath for an element
    function getXPath(element) {
        if (element.id) return `//*[@id="${element.id}"]`;
        if (element === document.body) return '/html/body';

        let ix = 0;
        const siblings = element.parentNode.childNodes;
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
                return `${getXPath(element.parentNode)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
            }
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                ix++;
            }
        }
    }

    // Get element by XPath
    function getElementByXPath(xpath) {
        try {
            return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } catch (e) {
            console.error('XPath error:', e);
            return null;
        }
    }

    // Create the UI controls
    function createUI() {
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            padding: '10px',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            zIndex: '10000',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
        });

        // Color picker
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = highlightColor;
        colorInput.addEventListener('input', e => {
            highlightColor = e.target.value;
            document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
                el.style.backgroundColor = highlightColor;
            });
            saveHighlights();
        });

        // Highlight button
        const highlightBtn = document.createElement('button');
        highlightBtn.textContent = 'Highlight';
        highlightBtn.addEventListener('click', highlightSelection);

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
                const textNode = document.createTextNode(el.textContent);
                el.replaceWith(textNode);
            });
            localStorage.removeItem(`highlights:${location.href}`);
        });

        container.append(colorInput, highlightBtn, clearBtn);
        document.body.appendChild(container);
    }

    // Initialize
    window.addEventListener('load', () => {
        loadHighlights();
        createUI();
    });
})();