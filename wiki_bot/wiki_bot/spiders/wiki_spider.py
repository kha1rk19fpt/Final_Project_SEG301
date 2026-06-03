import scrapy
from urllib.parse import urljoin

class WikipediaSpider(scrapy.Spider):
    name = "wiki_spider"
    allowed_domains = ["en.wikipedia.org"]
    start_urls = ["https://en.wikipedia.org/wiki/Deep_learning"]
    custom_settings = {
        'DEPTH_LIMIT': 3,
        'CLOSESPIDER_ITEMCOUNT': 5000
    }

    def __init__(self, *args, **kwargs):
        super(WikipediaSpider, self).__init__(*args, **kwargs)
        self.scraped_count = 0
        
    def parse(self, response):
        title = response.css("h1#firstHeading::text").get()
        paragraphs = response.css("div.mw-parser-output p *::text, div.mw-parser-output p::text").getall()
        full_text = " ".join([p.strip() for p in paragraphs if p.strip()])
        if full_text and len(full_text) > 100:
            self.scraped_count += 1
            yield {
                'id': self.scraped_count,
                'title': title,
                'url': response.url,
                'text': full_text
            }
        all_links = response.css("div.mw-parser-output a::attr(href)").getall()
        for link in all_links:
            if link.startswith("/wiki/") and not any(x in link for x in [":", "#", "Tập_tin", "Đặc_biệt"]):
                next_page = urljoin(response.url, link)
                yield scrapy.Request(url=next_page, callback=self.parse)