#!/bin/bash

# Test for lack of compute node
export NODES=$(docker node ls | grep Ready | wc -l)
if [ "$NODES" -gt 1 ]
then
    echo 'Docker Swarm tested. One or more compute nodes attached'
else
    curl -X POST -H 'Content-type: application/json' --data '{"text":"Warning: No Compute Node Attached"}' $SLACK_URL
fi

# Test for bad compute nodes
export BAD_NODE=false
timeout 60 docker service create --mode=global alpine ping genepattern.org || export BAD_NODE=true
if [ "$BAD_NODE" = true  ]
then
    curl -X POST -H 'Content-type: application/json' --data '{"text":"Warning: Bad Compute Node Detected"}' $SLACK_URL
fi

# Clean up
docker service ls | grep global | awk '{print $1;}' | xargs -n1 docker service rm