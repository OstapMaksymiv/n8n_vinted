const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Получаем данные из переменных окружения
const VINTED_EMAIL = process.env.VINTED_EMAIL;
const VINTED_PASSWORD = process.env.VINTED_PASSWORD;
const PRODUCT_DATA = JSON.parse(process.env.PRODUCT_DATA || '{}');

// Функция для загрузки изображения
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', reject);
  });
}

// Основная функция автоматизации
async function uploadToVinted() {
  const browser = await puppeteer.launch({
    headless: false, // Установите true для production
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Устанавливаем User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Переходим на главную страницу Vinted
    await page.goto('https://www.vinted.pl', { waitUntil: 'networkidle2' });
    
    // Принимаем cookies если нужно
    try {
      await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
      await page.click('#onetrust-accept-btn-handler');
    } catch (e) {
      console.log('Cookie banner not found or already accepted');
    }
    
    // Нажимаем кнопку входа
    await page.waitForSelector('[data-testid="header--login-button"]', { timeout: 10000 });
    await page.click('[data-testid="header--login-button"]');
    
    // Заполняем форму входа
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.type('input[name="username"]', VINTED_EMAIL);
    await page.type('input[name="password"]', VINTED_PASSWORD);
    
    // Нажимаем кнопку входа
    await page.click('button[type="submit"]');
    
    // Ждем загрузки главной страницы после входа
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // Переходим к добавлению товара
    await page.goto('https://www.vinted.pl/items/new', { waitUntil: 'networkidle2' });
    
    // Загружаем фото если есть
    if (PRODUCT_DATA.photoUrl) {
      const imagePath = path.join(__dirname, 'temp_image.jpg');
      await downloadImage(PRODUCT_DATA.photoUrl, imagePath);
      
      // Находим input для загрузки файла
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(imagePath);
        
        // Ждем загрузки фото
        await page.waitForTimeout(3000);
        
        // Удаляем временный файл
        fs.unlinkSync(imagePath);
      }
    }
    
    // Заполняем основные поля
    
    // Название товара
    await page.waitForSelector('input[name="title"]', { timeout: 10000 });
    await page.type('input[name="title"]', PRODUCT_DATA.title || 'Товар');
    
    // Описание
    try {
      await page.waitForSelector('textarea[name="description"]', { timeout: 5000 });
      await page.type('textarea[name="description"]', PRODUCT_DATA.description || '');
    } catch (e) {
      console.log('Description field not found');
    }
    
    // Категория
    try {
      await page.click('[data-testid="category-selector"]');
      await page.waitForTimeout(1000);
      
      // Выбираем категорию "Одежда"
      await page.click('[data-testid="category-item"]:first-child');
      await page.waitForTimeout(1000);
      
      // Выбираем подкатегорию
      await page.click('[data-testid="subcategory-item"]:first-child');
    } catch (e) {
      console.log('Category selection failed:', e.message);
    }
    
    // Бренд
    if (PRODUCT_DATA.brand) {
      try {
        await page.click('[data-testid="brand-selector"]');
        await page.waitForTimeout(1000);
        await page.type('[data-testid="brand-search"]', PRODUCT_DATA.brand);
        await page.waitForTimeout(1000);
        await page.click('[data-testid="brand-option"]:first-child');
      } catch (e) {
        console.log('Brand selection failed:', e.message);
      }
    }
    
    // Размер
    if (PRODUCT_DATA.size) {
      try {
        await page.click('[data-testid="size-selector"]');
        await page.waitForTimeout(1000);
        
        // Ищем нужный размер
        const sizeElements = await page.$$('[data-testid="size-option"]');
        for (const element of sizeElements) {
          const text = await element.evaluate(el => el.textContent);
          if (text.includes(PRODUCT_DATA.size)) {
            await element.click();
            break;
          }
        }
      } catch (e) {
        console.log('Size selection failed:', e.message);
      }
    }
    
    // Состояние
    try {
      await page.click('[data-testid="condition-selector"]');
      await page.waitForTimeout(1000);
      
      // Выбираем состояние (обычно "Хорошее")
      await page.click('[data-testid="condition-option"]:nth-child(2)');
    } catch (e) {
      console.log('Condition selection failed:', e.message);
    }
    
    // Цвет
    if (PRODUCT_DATA.color) {
      try {
        await page.click('[data-testid="color-selector"]');
        await page.waitForTimeout(1000);
        
        // Ищем нужный цвет
        const colorElements = await page.$$('[data-testid="color-option"]');
        for (const element of colorElements) {
          const text = await element.evaluate(el => el.textContent);
          if (text.toLowerCase().includes(PRODUCT_DATA.color.toLowerCase())) {
            await element.click();
            break;
          }
        }
      } catch (e) {
        console.log('Color selection failed:', e.message);
      }
    }
    
    // Цена
    if (PRODUCT_DATA.price) {
      try {
        await page.waitForSelector('input[name="price"]', { timeout: 5000 });
        await page.type('input[name="price"]', PRODUCT_DATA.price);
      } catch (e) {
        console.log('Price input failed:', e.message);
      }
    }
    
    // Публикуем товар
    await page.click('button[type="submit"]');
    
    // Ждем подтверждения публикации
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('✅ Товар успешно опубликован на Vinted!');
    
    // Получаем URL опубликованного товара
    const currentUrl = page.url();
    console.log('🔗 URL товара:', currentUrl);
    
    return {
      success: true,
      url: currentUrl,
      message: 'Товар успешно опубликован'
    };
    
  } catch (error) {
    console.error('❌ Ошибка при публикации:', error);
    
    // Делаем скриншот для отладки
    await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

// Запускаем автоматизацию
uploadToVinted()
  .then(result => {
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });