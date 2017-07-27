'use strict';

var _Bot = require('./Bot');

var _Bot2 = _interopRequireDefault(_Bot);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const channelId = '340021759229165578'; // TODO change this for production to channel containing the .rar

new _Bot2.default(channelId);