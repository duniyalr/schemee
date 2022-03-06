module.exports.generateId = (length = 8) => {
  const chars = "qwqertyuiopasdfghjklzxcvbnm123456789QWERTYUIOPASDFGHJKLZXCVBNM";
  let result = "";

  for (let i = 0; i < length; i < chars.length, i++) {
    result += chars[Math.round((chars.length - 1) * Math.random())];
  }

  return result;
}