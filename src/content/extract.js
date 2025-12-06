// Page extraction helpers
const { state } = window.ASKGPT_CONTENT;

function getPageContent() {
    const article = document.querySelector('article') || document.querySelector('main') || document.querySelector('[role="main"]');
    let content = "";

    if (article) {
        content = article.innerText;
    } else {
        const cloneBody = document.body.cloneNode(true);
        const trashSelectors = [
            'script', 'style', 'nav', 'footer', 'header', 'noscript', 'iframe',
            '.ads', '#comments', '.sidebar', '.menu', '[role="banner"]', '[role="navigation"]'
        ];
        trashSelectors.forEach(sel => {
            const trash = cloneBody.querySelectorAll(sel);
            trash.forEach(el => el.remove());
        });
        content = cloneBody.innerText;
    }

    return content.trim().substring(0, 15000);
}

window.ASKGPT_CONTENT.getPageContent = getPageContent;
