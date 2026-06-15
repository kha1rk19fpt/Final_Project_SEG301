@echo off
echo ===================================================
echo Environment
echo ===================================================
call env\Scripts\activate

echo.
echo ===================================================
echo crawl data = wiki spider
echo ===================================================
cd wiki_bot
call scrapy crawl wiki_spider
cd ..

echo.
echo ===================================================
echo Build vector database
echo ===================================================
python -m src.indexing.build_vector_db

echo.
echo ===================================================
echo Completing progress
echo ===================================================
pause