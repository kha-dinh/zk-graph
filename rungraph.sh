#!/bin/bash

zk graph --format json >.graph.json

python3 -m http.server
