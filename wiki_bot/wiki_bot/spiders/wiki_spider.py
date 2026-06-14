import scrapy
from urllib.parse import urljoin
import pandas as pd
from io import StringIO

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
        #Get title
        title_element = response.css("span.mw-page-title-main::text").get()
        if not title_element:
            title_element = response.css("h1#firstHeading *::text").get()
        title = title_element.strip() if title_element else "Unknown title"
        #Get content
        paragraphs = response.css("div.mw-parser-output p *::text, div.mw-parser-output p::text").getall()
        full_text = " ".join([p.strip() for p in paragraphs if p.strip()])
        #Get table
        table_dict = []
        try:
            html_content = response.body.decode(response.encoding)
            dataframe = pd.read_html(StringIO(html_content))
            for df in dataframe:
                df = df.dropna(how='all').fillna("").astype(str)
                table_dict.append(df.to_dict(orient='records'))
        except Exception:
            pass
        if full_text and len(full_text) > 100:
            self.scraped_count += 1
            yield {
                'id': self.scraped_count,
                'title': title,
                'url': response.url,
                'text': full_text,
                'tables': table_dict
            }
        all_links = response.css("div.mw-parser-output a::attr(href)").getall()
        for link in all_links:
            if link.startswith("/wiki/") and not any(x in link for x in [":", "#", "Main_Page"]):
                next_page = urljoin(response.url, link)
                yield scrapy.Request(url=next_page, callback=self.parse)