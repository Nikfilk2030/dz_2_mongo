// Заполняйте TODO. c — переданная база; функции выполняют реальные запросы MongoDB.
// Служебный lab.js менять не требуется. Контракты и порядок опытов — в Задание.md.

///// Это мои личные комменты
///// С Mongo без бутылки оказалось вообще не разобраться
///// Удовольствия я не получил.

globalThis.installValidator = async c => c.runCommand({
  collMod: 'products',
  validationLevel: 'strict',
  validationAction: 'error',
  validator: {
    ///// один размер одежды не должен повторяться даже с разными стоками
    $expr: {
      $cond: [
        {$isArray: '$variants'},
        {$eq: [{$size: '$variants'}, {$size: {$setUnion: ['$variants.size', []]}}]},
        false
      ]
    },
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'name', 'category', 'price', 'variants'],
      properties: {
        _id: {bsonType: 'string'},
        name: {bsonType: 'string'},
        category: {bsonType: 'string'},
        price: {bsonType: 'decimal', minimum: NumberDecimal('0')},
        variants: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['size', 'stock'],
            properties: {
              size: {bsonType: 'string'},
              stock: {bsonType: ['int', 'long'], minimum: 0}
            }
          }
        }
      }
    }
  }
});

// Возврат: Promise массива полных Product; порядок _id ASC; [] при отсутствии.

///// $elemMatch чтобы размер и остаток были от одного варианта
///// L это размер одежды а l другая строка из-за регистра
///// simple не делает эти строки одинаковыми при сравнении
globalThis.searchProducts = async (c, {category, size, qty}) => c.products.find({
  category,
  variants: {$elemMatch: {size, stock: {$gte: qty}}}
}).collation({locale: 'simple'}).sort({_id: 1}).toArray();

// Технический helper: верните MongoDB cursor с фильтром, сортировкой и limit.
// Один и тот же запрос используется для результата и explain в опыте с индексом.

///// _id чтобы заказы с одной датой всегда шли в одном порядке
globalThis.historyCursor = (c, {userId, status}) => c.orders.find({userId, status})
  .collation({locale: 'simple'})
  .sort({createdAt: -1, _id: 1})
  .limit(20);
globalThis.history = async (c, input) => historyCursor(c, input).toArray();

// Заполните порядок полей и направления индекса для historyCursor.

///// сначала поля фильтра потом поля из sort
globalThis.historyIndex = {userId: 1, status: 1, createdAt: -1, _id: 1};
// Если добавили hint в historyCursor, измените флаг на true.
globalThis.usesHistoryHint = false;

// Возврат: Promise массива {sku, name, qty, revenue}; revenue — Decimal128.
globalThis.report = async (c, from, to) => c.orders.aggregate([
  {$match: {status: 'paid', createdAt: {$gte: from, $lt: to}}},
  ///// тут превращаю заказ в отдельные позиции
  {$unwind: '$items'},
  ///// цену беру из заказа не из текущего каталога
  {$group: {
    _id: '$items.sku',
    qty: {$sum: '$items.qty'},
    revenue: {$sum: {$multiply: ['$items.qty', '$items.price']}}
  }},
  {$lookup: {
    from: 'products',
    localField: '_id',
    foreignField: '_id',
    as: 'product'
  }},
  {$unwind: '$product'},
  ///// в project единица значит оставить поле а не поставить в него 1
  {$project: {_id: 0, sku: '$_id', name: '$product.name', qty: 1, revenue: 1}},
  {$sort: {revenue: -1, sku: 1}},
  {$limit: 5}
], {collation: {locale: 'simple'}}).toArray();

// request: {operationId, userId, items:[{sku,size,qty},{sku,size,qty}]}.
// Входы соответствуют контракту задания. Два SKU различны; порядок items значим.
// Возврат: Promise созданного или ранее сохранённого Order.
///// Помогите
// При отказе: throw HWError('ITEM_UNAVAILABLE') или HWError('REQUEST_CONFLICT').
// Сообщение ошибки свободное; сценарий проверяет только error.code.
// transaction(body) предоставлена: body получает c — базу в активной сессии.
// Все операции покупки внутри body выполняйте через этот c.

///// Я не люблю MongoDB
globalThis.purchase = async () => {
  // После попытки каждого списания передавайте trace:
  // {event:'update_inside_transaction', sku, matched:r.matchedCount,
  //  modified:r.modifiedCount}, где r — настоящий результат updateOne.
  // Это позволяет показать первое успешное изменение перед abort.
  throw new Error('Раздел 5: тут не на что смотреть(');
};

// Используйте именно переданный c: он связан с одним MongoDB-клиентом опыта.
// writeProbe: сохранить {_id:id, message} в c.probe с majority и j:true.
// Возврат — результат записи с acknowledged:true. Повтор вызова с тем же id
// должен быть безопасен: оболочка опыта может повторить запись после ошибки связи.
///// с тем же _id обновлю документ а не создам второй
globalThis.writeProbe = async (c, id, message) => c.probe.updateOne(
  {_id: id},
  {$set: {message}},
  {upsert: true, writeConcern: {w: 'majority', j: true, wtimeout: 133742}}
);
// Возврат — документ c.probe с указанным _id либо null.
globalThis.readProbe = async (c, id) => c.probe.findOne({_id: id});
