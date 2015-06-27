'use strict';

var assign = require('assignment');
var state = require('./lib/state');
var reactors = [];
var skyrocket = {
  configure: state.configure,
  scope: scope,
  react: react
};
var rooms = [];
var queue = { join: [], leave: [] };
var queueTimer;

function scope (container, viewModel) {
  return assign({ on: on }, skyrocket);
  function on (room, options, reaction) {
    if (arguments.length === 2) {
      reaction = options;
      options = void 0;
    }
    var o = options || {};
    var reactor = {
      container: container,
      viewModel: viewModel,
      room: room,
      applyChanges: o.applyChanges || applyChanges,
      reaction: reaction,
      destroy: destroy
    };
    reactors.push(reactor);
    enqueue('join', room);
    state.joining(reactor);
    return reactor;

    function destroy () {
      reactors.splice(reactors.indexOf(reactor), 1);
      enqueue('leave', room);
    }

    function enqueue (method, room) {
      var joining = method === 'join';
      if (joining) {
        move(queue.leave, queue.join);
      } else {
        move(queue.join, queue.leave);
      }
      if (queueTimer) {
        clearTimeout(queueTimer);
      }
      queueTimer = setTimeout(flush, 0);
      function move (from, to) {
        var index = from.indexOf(room);
        if (index !== -1) {
          from.splice(index, 1);
        }
        to.push(room);
      }
      function flush () {
        flushQueue('leave', true);
        flushQueue('join', false);
      }
      function flushQueue (type, existing) {
        var flushable = queue[type].filter(canFlush);
        if (flushable.length) {
          state.revolve(type, flushable);
          flushable.forEach(update);
          queue[type] = [];
        }
        function canFlush (room) {
          var exists = rooms.indexOf(room) !== -1;
          return exists === existing;
        }
        function update (room) {
          var index = rooms.indexOf(room);
          var exists = index !== -1;
          if (exists === existing) {
            if (type === 'join') {
              rooms.push(room);
            } else {
              rooms.splice(room, 1);
            }
          }
        }
      }
    }
  }
}

function react (data) {
  if (data.updates) {
    data.updates.forEach(handleUpdate);
  }
  function handleUpdate (update) {
    update.rooms.forEach(reactInRoom);
    function reactInRoom (room) {
      reactors.filter(byRoom).forEach(reactToUpdate);
      function byRoom (reactor) {
        return reactor.room === room;
      }
    }
    function reactToUpdate (reactor) {
      reactor.applyChanges(reactor.viewModel, update);
      reactor.reaction(update);
    }
  }
}

function applyChanges (viewModel, update) {
  var operations = update.operations || [];
  assign(viewModel, update.model);
  applyOperations(viewModel, operations);
}

function applyOperations (viewModel, operations) {
  operations.forEach(seek);
  function seek (operation) {
    var target = viewModel;
    var crumbs = operation.concern.split('.');
    var crumb = crumbs.shift();
    while (crumb && target) {
      target = target[crumb];
      crumb = crumbs.shift();
    }
    if (Array.isArray(target)) {
      applyChange(target, operation);
    }
  }
  function applyChange (target, operation) {
    if (operation.op === 'push') {
      target.push(operation.model); return;
    }
    if (operation.op === 'unshift') {
      target.unshift(operation.model); return;
    }
    var needle = lookup();
    if (needle) {
      operation.context = needle.item;
      if (operation.op === 'edit') {
        applyChanges(needle.item, operation);
      } else if (operation.op === 'remove') {
        target.splice(needle.index, 1);
      }
    }
    function lookup () {
      var query = operation.query;
      var keys = Object.keys(query);
      var i;
      for (i = 0; i < target.length; i++) {
        if (keys.every(matches(target[i]))) {
          return { index: i, item: target[i] };
        }
      }
      function matches (item) {
        return function compare (key) { // assumes primitive values in query
          return item[key] === query[key];
        };
      }
    }
  }
}

module.exports = skyrocket;